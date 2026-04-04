use super::{config, meta, util, value};
use crate::util::data_source::DataSource;
use color_eyre::{Help, SectionExt};
use endiannezz::ext::EndianWriter;
use eyre::{Result, WrapErr, bail, eyre};
use itertools::Itertools;
use once_cell::sync::OnceCell;
use parking_lot::RwLock;
use std::borrow::Cow;
use std::collections::HashMap;
use std::fmt::Write as _;
use std::io::{BufWriter, Write};
use std::ops::{Deref, Range};
use std::sync::Arc;

#[derive(Clone)]
pub struct WithContent<V> {
    /// Backing data store. Must be a root DataSource (offset == 0, covering
    /// the entire reader) because `DataFieldView::ByteRange` and
    /// `LazyEntry::Deferred` store absolute byte offsets into it.
    pub content: DataSource,
    view: V,
}

impl<V> WithContent<V> {
    pub fn extract_view(self) -> V {
        self.view
    }
}

pub type Data = WithContent<DataView>;

#[derive(Clone)]
pub struct DataView {
    pub version: u16,
    pub config: config::Config,
    pub lists: Arc<[DataListView]>, // immutable shared array of lists
}

pub type DataList = WithContent<DataListView>;

#[derive(Clone)]
pub struct DataListView {
    pub prefix: Vec<u8>,
    pub entries: Arc<RwLock<Vec<LazyEntry>>>,
    pub config: config::ListConfig,
    #[allow(clippy::type_complexity)]
    id_cache: Arc<RwLock<Option<HashMap<u32, Vec<usize>>>>>,
}

pub type DataEntry = WithContent<DataEntryView>;

#[derive(Clone)]
pub struct DataEntryView {
    pub fields: Arc<RwLock<Box<[DataFieldView]>>>,
}

pub enum DataFieldView {
    ByteRange { range: Range<usize> },
    Bytes(Box<[u8]>),
}

/// Lazy wrapper for entry data. Stores either a byte range into the backing
/// content (deferred parsing) or a fully materialized entry.
#[derive(Clone)]
pub enum LazyEntry {
    /// Entry has not been parsed yet; only its byte range is known.
    Deferred {
        byte_range: Range<usize>,
        parsed: OnceCell<DataEntryView>,
    },
    /// Entry created by mutation (append/setitem) or explicitly materialized.
    Materialized(DataEntryView),
}

impl LazyEntry {
    /// Returns a reference to the parsed entry, parsing on first access.
    pub fn resolve(
        &self,
        content: &DataSource,
        list_config: &config::ListConfig,
    ) -> Result<&DataEntryView> {
        match self {
            LazyEntry::Deferred { byte_range, parsed } => parsed.get_or_try_init(|| {
                let mut entry_data = content.get(byte_range.clone())?;
                DataEntryView::parse(&mut entry_data, list_config)
            }),
            LazyEntry::Materialized(entry) => Ok(entry),
        }
    }

    fn write<W: Write>(&self, out: &mut BufWriter<W>, content: &DataSource) -> Result<()> {
        match self {
            LazyEntry::Deferred { byte_range, parsed } => match parsed.get() {
                Some(entry) => entry.write(out, content),
                None => {
                    let bytes = content
                        .read_bytes_at(byte_range.start, byte_range.end - byte_range.start)?;
                    out.write_all(&bytes)?;
                    Ok(())
                }
            },
            LazyEntry::Materialized(entry) => entry.write(out, content),
        }
    }
}

impl<T> WithContent<T> {
    pub fn from(view: T, content: DataSource) -> Self {
        Self { content, view }
    }
}

impl<T> Deref for WithContent<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.view
    }
}

impl Data {
    pub fn from_bytes(bytes: Vec<u8>, config: config::Config) -> Result<Self> {
        let content = DataSource::from_bytes(bytes);
        let view = DataView::parse(&content, config)?;
        Ok(Self::from(view, content))
    }

    pub fn write<W: Write>(&self, out: &mut BufWriter<W>) -> Result<()> {
        self.view.write(out, &self.content)
    }

    pub fn find_entry(
        &self,
        id: u32,
        space_id: Option<&str>,
        allow_unknown: bool,
    ) -> Option<(usize, DataEntry)> {
        self.find_entries(id, space_id, allow_unknown)
            .next()
            .map(|(i, view)| (i, DataEntry::from(view, self.content.clone())))
    }

    fn find_entries<'a>(
        &'a self,
        id: u32,
        space_id: Option<&'a str>,
        allow_unknown: bool,
    ) -> impl Iterator<Item = (usize, DataEntryView)> + 'a {
        let is_valid_space = move |cur_space_id: Option<&'static str>| -> bool {
            match space_id {
                None => true,
                Some(space_id) => match cur_space_id {
                    Some(cur_space_id) => cur_space_id == space_id,
                    None => allow_unknown,
                },
            }
        };

        self.lists
            .iter()
            .enumerate()
            .filter(move |(_, list)| is_valid_space(list.config.space_id))
            .flat_map(move |(i, list)| {
                list.find_entries(id, &self.content)
                    .into_iter()
                    .map(move |entry| (i, entry))
            })
    }
}

impl DataView {
    const UNKNOWN: u16 = 0x3000;

    fn parse_header_impl(data: &mut DataSource) -> Result<u16> {
        let version: u16 = data
            .get(0..2)
            .wrap_err("Can't parse version bytes")?
            .as_le()?;

        let unknown: u16 = data
            .get(2..4)
            .wrap_err("Can't parse after-version bytes")?
            .as_le()?;

        data.remove_prefix(4);

        if unknown != Self::UNKNOWN {
            bail!(
                "Unexpected header: {actual:04X} instead of {expected:04X}",
                expected = Self::UNKNOWN,
                actual = unknown,
            );
        }

        Ok(version)
    }

    pub fn parse_header(content: &DataSource) -> Result<u16> {
        Self::parse_header_impl(&mut content.clone())
    }

    pub fn parse(content: &DataSource, config: config::Config) -> Result<Self> {
        let with_backtrace =
            |result, lists| Self::with_backtrace(result, lists, &config, content).unwrap();

        let mut data = content.clone();

        let version = Self::parse_header_impl(&mut data).wrap_err_with(|| {
            let preview_len = content.size().min(32);
            match content.read_bytes_at(0, preview_len) {
                Ok(preview) => {
                    format!(
                        "Can't parse header, possibly corrupted data: {:02X?}",
                        preview.as_ref()
                    )
                }
                Err(_) => "Can't parse header, possibly corrupted data".to_string(),
            }
        })?;

        let mut lists = Vec::<DataListView>::with_capacity(config.lists.len());

        for list_config in config.lists.iter() {
            match DataListView::parse(&mut data, version, list_config) {
                Ok(list) => lists.push(list),
                Err(err) => {
                    return with_backtrace(
                        Err(err).wrap_err(eyre!("Can't parse list '{}'", list_config.caption)),
                        &lists,
                    );
                }
            }
        }

        let rest_size = data.size();
        if rest_size > 0 {
            return with_backtrace(
                Err(eyre!("Expected EOF, got {rest_size} bytes left")),
                &lists,
            );
        }

        Ok(Self {
            version,
            config,
            lists: lists.into(),
        })
    }

    pub fn write<W: Write>(&self, out: &mut BufWriter<W>, content: &DataSource) -> Result<()> {
        out.write_le(self.version)?;
        out.write_le(Self::UNKNOWN)?;

        for list in self.lists.iter() {
            list.write(out, content)?;
        }

        Ok(())
    }

    fn with_backtrace<T>(
        mut result: Result<T>,
        parsed_lists: &[DataListView],
        config: &config::Config,
        content: &DataSource,
    ) -> Result<T> {
        for (list, config) in parsed_lists.iter().zip(config.lists.iter()).rev().take(3) {
            let entries = list.entries.read();

            let presented_entries = entries
                .iter()
                .enumerate()
                .rev()
                .take(3)
                .map(
                    |(i, lazy_entry)| match lazy_entry.resolve(content, config) {
                        Ok(entry) => {
                            format!("#{}: {}", i + 1, entry.to_string(config, content))
                        }
                        Err(_) => format!("#{}: <unparsable>", i + 1),
                    },
                )
                .join("\n");

            result = result.section(presented_entries.header(format!(
                "Previously parsed list - '{}' (dt={}, space_id='{}') with {} entries",
                config.caption,
                config.dt.0,
                config.space_id.unwrap_or("unknown"),
                entries.len()
            )));
        }

        result
    }
}

impl DataListView {
    fn parse(
        data: &mut DataSource,
        version: u16,
        list_config: &config::ListConfig,
    ) -> Result<Self> {
        let prefix_len = match list_config.offset {
            config::ListOffset::Auto => match list_config.dt {
                // TODO: move to GameDialect
                util::DataType(1) if version >= 191 => 8 + data.get(4..8)?.as_le::<u32>()? as usize,
                util::DataType(21) => 8 + 4 + data.get(4..8)?.as_le::<u32>()? as usize,
                util::DataType(101) => 8 + data.get(4..8)?.as_le::<u32>()? as usize,
                _ => {
                    bail!(
                        "Unexpected element list #{dt} '{name}' with AUTO offset",
                        dt = list_config.dt.0,
                        name = list_config.caption
                    );
                }
            },
            config::ListOffset::Fixed(offset) => offset,
        };

        let prefix = data.get(..prefix_len)?.to_bytes()?.into_owned();
        data.remove_prefix(prefix_len);

        // TODO: move to GameDialect
        if version >= 191 {
            let _list_index = data.get(..4)?.as_le::<u32>()? as usize;
            data.remove_prefix(4);
        }

        let len = data.get(..4)?.as_le::<u32>()? as usize;
        data.remove_prefix(4);

        // TODO: move to GameDialect
        if version >= 191 {
            // single element size
            data.remove_prefix(4);
        }

        if len > 1_000_000 {
            bail!(
                "Invalid format: length of {} list is too big ({})",
                list_config.caption,
                len
            );
        }

        let mut entries = Vec::with_capacity(len);

        if let Some(fixed_size) = list_config.fixed_entry_byte_size() {
            // Fast path: all fields have fixed sizes, compute offsets arithmetically
            let base_offset = data.base_offset();
            for _ in 0..len {
                let entry_start = base_offset + entries.len() * fixed_size;
                entries.push(LazyEntry::Deferred {
                    byte_range: entry_start..entry_start + fixed_size,
                    parsed: OnceCell::new(),
                });
            }
            data.remove_prefix(len * fixed_size);
        } else {
            // Slow path: variable-size entries, walk each to find boundaries
            for i in 0..len {
                let entry_start = data.base_offset();
                let entry_size = list_config
                    .compute_entry_byte_size(data)
                    .wrap_err_with(|| {
                        eyre!(
                            "Failed to compute size of {}/{} entry in list {} (dt={})",
                            i + 1,
                            len,
                            list_config.caption,
                            list_config.dt.0
                        )
                    })?;
                entries.push(LazyEntry::Deferred {
                    byte_range: entry_start..entry_start + entry_size,
                    parsed: OnceCell::new(),
                });
                data.remove_prefix(entry_size);
            }
        }

        Ok(Self {
            prefix,
            entries: Arc::new(RwLock::new(entries)),
            config: list_config.clone(),
            id_cache: Arc::new(RwLock::new(None)),
        })
    }

    pub fn write<W: Write>(&self, out: &mut BufWriter<W>, content: &DataSource) -> Result<()> {
        let entries = self.entries.read();

        out.write_all(&self.prefix)?;
        out.write_le(entries.len() as u32)?;
        for entry in entries.iter() {
            entry.write(out, content)?;
        }

        Ok(())
    }

    fn build_id_cache(&self, content: &DataSource) -> HashMap<u32, Vec<usize>> {
        let id_index = match self.config.find_field("ID") {
            Some(idx) => idx,
            None => return HashMap::new(),
        };

        let entries = self.entries.read();
        let mut cache: HashMap<u32, Vec<usize>> = HashMap::with_capacity(entries.len());

        for (i, lazy_entry) in entries.iter().enumerate() {
            let entry = match lazy_entry.resolve(content, &self.config) {
                Ok(e) => e,
                Err(_) => continue,
            };
            let id_field = &entry.fields.read()[id_index];
            let Ok(bytes) = id_field.get_bytes(content) else {
                continue;
            };
            if let Ok(value::ReadValue::Integer(id_value)) =
                self.config.fields[id_index].meta_type.read_value(&bytes)
            {
                cache.entry(id_value as u32).or_default().push(i);
            }
        }

        cache
    }

    pub fn find_entries(&self, id: u32, content: &DataSource) -> Vec<DataEntryView> {
        if self.config.find_field("ID").is_none() {
            return Default::default();
        }

        {
            let cache = self.id_cache.read();
            if let Some(ref map) = *cache {
                return self.lookup_cached_entries(map, id, content);
            }
        }

        let mut cache = self.id_cache.write();
        // Double-check: another thread may have populated the cache
        if cache.is_none() {
            *cache = Some(self.build_id_cache(content));
        }
        self.lookup_cached_entries(cache.as_ref().unwrap(), id, content)
    }

    fn lookup_cached_entries(
        &self,
        cache: &HashMap<u32, Vec<usize>>,
        id: u32,
        content: &DataSource,
    ) -> Vec<DataEntryView> {
        match cache.get(&id) {
            Some(indices) => {
                let entries = self.entries.read();
                indices
                    .iter()
                    .filter_map(|&i| {
                        let entry = entries.get(i)?.resolve(content, &self.config).ok()?;
                        Some(entry.clone())
                    })
                    .collect()
            }
            None => Vec::new(),
        }
    }

    fn invalidate_id_cache(&self) {
        *self.id_cache.write() = None;
    }

    pub fn push_entry(&self, entry: LazyEntry) {
        self.entries.write().push(entry);
        self.invalidate_id_cache();
    }

    pub fn set_entry(&self, index: usize, entry: LazyEntry) {
        self.entries.write()[index] = entry;
        self.invalidate_id_cache();
    }

    pub fn remove_entry(&self, index: usize) {
        self.entries.write().remove(index);
        self.invalidate_id_cache();
    }
}

impl DataEntry {
    pub fn deep_clone(&self) -> Result<Self> {
        Ok(Self {
            content: self.content.clone(),
            view: self.view.deep_clone(&self.content)?,
        })
    }
}

impl DataEntryView {
    fn new(fields: Vec<DataFieldView>) -> Self {
        Self {
            fields: Arc::new(RwLock::new(fields.into_boxed_slice())),
        }
    }

    fn parse(data: &mut DataSource, list_config: &config::ListConfig) -> Result<Self> {
        let fields: Result<Vec<_>, _> = list_config
            .fields
            .iter()
            .map(|field| DataFieldView::parse(data, field))
            .collect();

        Ok(Self::new(fields?))
    }

    pub fn write<W: Write>(&self, out: &mut BufWriter<W>, content: &DataSource) -> Result<()> {
        for field in self.fields.read().iter() {
            field.write(out, content)?;
        }

        Ok(())
    }

    fn deep_clone(&self, content: &DataSource) -> Result<Self> {
        let fields: Result<Vec<_>, _> = self
            .fields
            .read()
            .iter()
            .map(|field| field.deep_clone(content))
            .collect();
        Ok(Self::new(fields?))
    }

    pub fn to_string(&self, list_config: &config::ListConfig, content: &DataSource) -> String {
        format::lazy_format!(|f| { self.fmt(list_config, content, f) }).to_string()
    }

    pub fn fmt(
        &self,
        list_config: &config::ListConfig,
        content: &DataSource,
        f: &mut std::fmt::Formatter<'_>,
    ) -> std::fmt::Result {
        let meta_fields = &list_config.fields;

        let mut sep = "";
        f.write_char('{')?;
        for (meta_field, field) in meta_fields.iter().zip(self.fields.read().iter()) {
            f.write_str(std::mem::replace(&mut sep, ", "))?;

            let bytes = match field.get_bytes(content) {
                Ok(b) => b,
                Err(e) => {
                    write!(f, "{}=<read_err={}>", &meta_field.name, e)?;
                    continue;
                }
            };
            let value = meta_field.meta_type.read_value(&bytes);

            match value {
                Ok(value) => write!(f, "{}={}", &meta_field.name, value)?,
                Err(err) => write!(f, "{}=<err={:?}>", &meta_field.name, err.to_string())?,
            }
        }
        f.write_char('}')?;

        Ok(())
    }
}

impl DataFieldView {
    fn from_source(source: &DataSource) -> Self {
        DataFieldView::ByteRange {
            range: source.base_offset()..source.base_offset() + source.size(),
        }
    }

    fn parse(data: &mut DataSource, field: &meta::MetaField) -> Result<Self> {
        let byte_size = field.meta_type.get_byte_size(data)?;
        let field_data = data.get(..byte_size)?;

        data.remove_prefix(byte_size);

        Ok(DataFieldView::from_source(&field_data))
    }

    pub fn get_bytes<'a>(&'a self, content: &'a DataSource) -> Result<Cow<'a, [u8]>> {
        match self {
            DataFieldView::ByteRange { range } => {
                content.read_bytes_at(range.start, range.end - range.start)
            }
            DataFieldView::Bytes(bytes) => Ok(Cow::Borrowed(bytes)),
        }
    }

    pub fn write<W: Write>(&self, out: &mut BufWriter<W>, content: &DataSource) -> Result<()> {
        out.write_all(&self.get_bytes(content)?)?;
        Ok(())
    }

    fn deep_clone(&self, content: &DataSource) -> Result<Self> {
        let bytes = self.get_bytes(content)?.into_owned();
        Ok(DataFieldView::Bytes(bytes.into_boxed_slice()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::elements::game::GameDialectRef;
    use crate::{include_resources_str, include_test_data_bytes};

    fn parse_v7_config() -> config::Config {
        config::Config::parse(
            include_resources_str!("known_configs/PW_1.2.6_v7.cfg"),
            None,
            GameDialectRef::PW,
        )
        .unwrap()
    }

    fn parse_v7() -> (DataView, DataSource) {
        let bytes = include_test_data_bytes!("elements/elements_v7.data");
        let content = DataSource::from_bytes(bytes.to_vec());
        let data = DataView::parse(&content, parse_v7_config()).unwrap();
        (data, content)
    }

    #[test]
    fn parse_elements_v7() {
        let _ = parse_v7();
    }

    #[test]
    fn roundtrip_without_access() {
        let (data, content) = parse_v7();
        // Save without accessing any entries (raw byte write path)
        let mut output = Vec::new();
        data.write(&mut BufWriter::new(&mut output), &content)
            .unwrap();
        assert_eq!(content.to_bytes().unwrap().as_ref(), output.as_slice());
    }

    #[test]
    fn roundtrip_with_partial_access() {
        let (data, content) = parse_v7();
        // Access only the first entry of the first non-empty list
        for list in data.lists.iter() {
            let entries = list.entries.read();
            if !entries.is_empty() {
                let _ = entries[0].resolve(&content, &list.config).unwrap();
                break;
            }
        }
        let mut output = Vec::new();
        data.write(&mut BufWriter::new(&mut output), &content)
            .unwrap();
        assert_eq!(content.to_bytes().unwrap().as_ref(), output.as_slice());
    }

    #[test]
    fn parse_empty_data() {
        let content = DataSource::from_bytes(b"".to_vec());
        let result = DataView::parse(&content, parse_v7_config());
        let err = result.err().expect("expected error for empty data");
        assert!(
            format!("{err:?}").contains("Can't parse version bytes"),
            "unexpected error: {err:?}"
        );
    }

    #[test]
    fn parse_truncated_header() {
        // Only version, missing UNKNOWN field
        let content = DataSource::from_bytes(b"\x07\x00".to_vec());
        let result = DataView::parse(&content, parse_v7_config());
        let err = result.err().expect("expected error for truncated header");
        assert!(
            format!("{err:?}").contains("Can't parse after-version bytes"),
            "unexpected error: {err:?}"
        );
    }

    #[test]
    fn parse_bad_unknown_field() {
        // Version 7 + wrong UNKNOWN value (0x0000 instead of 0x3000)
        let content = DataSource::from_bytes(b"\x07\x00\x00\x00".to_vec());
        let result = DataView::parse(&content, parse_v7_config());
        let err = result.err().expect("expected error for bad UNKNOWN field");
        assert!(
            format!("{err:?}").contains("Unexpected header"),
            "unexpected error: {err:?}"
        );
    }
}
