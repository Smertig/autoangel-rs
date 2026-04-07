use super::{config, meta, util, value};
use crate::util::data_source::{DataReader, DataSource};
use color_eyre::{Help, SectionExt};
use endiannezz::ext::EndianWriter;
use eyre::{Result, WrapErr, bail, eyre};
use once_cell::sync::OnceCell;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::fmt::Write as _;
use std::io::{BufWriter, Write};
use std::ops::{Deref, Range};
use std::sync::Arc;

#[derive(Clone)]
pub struct WithContent<V, R: DataReader> {
    /// Backing data store. Must be a root DataSource (offset == 0, covering
    /// the entire reader) because `DataFieldView::ByteRange` and
    /// `LazyEntry::Deferred` store absolute byte offsets into it.
    pub content: DataSource<R>,
    view: V,
}

impl<V, R: DataReader> WithContent<V, R> {
    pub fn extract_view(self) -> V {
        self.view
    }
}

pub type Data<R> = WithContent<DataView, R>;

#[derive(Clone)]
pub struct DataView {
    pub version: u16,
    pub config: config::Config,
    pub lists: Arc<[DataListView]>, // immutable shared array of lists
}

pub type DataList<R> = WithContent<DataListView, R>;

#[derive(Clone)]
pub struct DataListView {
    pub prefix: Vec<u8>,
    pub entries: Arc<RwLock<Vec<LazyEntry>>>,
    pub config: config::ListConfig,
    #[allow(clippy::type_complexity)]
    id_cache: Arc<RwLock<Option<HashMap<u32, Vec<usize>>>>>,
}

pub type DataEntry<R> = WithContent<DataEntryView, R>;

#[derive(Clone)]
pub struct DataEntryView {
    pub fields: Arc<RwLock<Box<[DataFieldView]>>>,
}

pub enum DataFieldView {
    ByteRange { range: Range<u64> },
    Bytes(Box<[u8]>),
}

/// Lazy wrapper for entry data. Stores either a byte range into the backing
/// content (deferred parsing) or a fully materialized entry.
#[derive(Clone)]
pub enum LazyEntry {
    /// Entry has not been parsed yet; only its byte range is known.
    Deferred {
        byte_range: Range<u64>,
        parsed: OnceCell<DataEntryView>,
    },
    /// Entry created by mutation (append/setitem) or explicitly materialized.
    Materialized(DataEntryView),
}

impl LazyEntry {
    /// Returns a reference to the parsed entry, parsing on first access.
    pub async fn resolve<R: DataReader>(
        &self,
        content: &DataSource<R>,
        list_config: &config::ListConfig,
    ) -> Result<&DataEntryView> {
        match self {
            LazyEntry::Deferred { byte_range, parsed } => {
                if let Some(v) = parsed.get() {
                    return Ok(v);
                }
                let mut entry_data = content.get(byte_range.clone())?;
                let view = DataEntryView::parse(&mut entry_data, list_config).await?;
                Ok(parsed.get_or_init(|| view))
            }
            LazyEntry::Materialized(entry) => Ok(entry),
        }
    }

    async fn write<R: DataReader, W: Write>(
        &self,
        out: &mut BufWriter<W>,
        content: &DataSource<R>,
    ) -> Result<()> {
        match self {
            LazyEntry::Deferred { byte_range, parsed } => match parsed.get() {
                Some(entry) => entry.write(out, content).await,
                None => {
                    content
                        .read_at(
                            byte_range.start,
                            (byte_range.end - byte_range.start) as usize,
                            |bytes| out.write_all(bytes),
                        )
                        .await??;
                    Ok(())
                }
            },
            LazyEntry::Materialized(entry) => entry.write(out, content).await,
        }
    }
}

impl<T, R: DataReader> WithContent<T, R> {
    pub fn from(view: T, content: DataSource<R>) -> Self {
        Self { content, view }
    }
}

impl<T, R: DataReader> Deref for WithContent<T, R> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.view
    }
}

impl Data<Vec<u8>> {
    pub async fn from_bytes(bytes: Vec<u8>, config: config::Config) -> Result<Self> {
        let content = DataSource::from_bytes(bytes);
        let view = DataView::parse(&content, config).await?;
        Ok(Self::from(view, content))
    }
}

impl<R: DataReader> Data<R> {
    pub async fn write<W: Write>(&self, out: &mut BufWriter<W>) -> Result<()> {
        self.view.write(out, &self.content).await
    }

    pub async fn find_entry(
        &self,
        id: u32,
        space_id: Option<&str>,
        allow_unknown: bool,
    ) -> Option<(usize, DataEntry<R>)> {
        self.view
            .find_entry(id, space_id, allow_unknown, &self.content)
            .await
            .map(|(i, view)| (i, DataEntry::from(view, self.content.get(..).unwrap())))
    }
}

impl DataView {
    const UNKNOWN: u16 = 0x3000;

    pub async fn find_entry<R: DataReader>(
        &self,
        id: u32,
        space_id: Option<&str>,
        allow_unknown: bool,
        content: &DataSource<R>,
    ) -> Option<(usize, DataEntryView)> {
        let is_valid_space = |cur_space_id: Option<&'static str>| -> bool {
            match space_id {
                None => true,
                Some(space_id) => match cur_space_id {
                    Some(cur_space_id) => cur_space_id == space_id,
                    None => allow_unknown,
                },
            }
        };

        for (i, list) in self.lists.iter().enumerate() {
            if !is_valid_space(list.config.space_id) {
                continue;
            }
            let entries = list.find_entries(id, content).await;
            if let Some(view) = entries.into_iter().next() {
                return Some((i, view));
            }
        }
        None
    }

    async fn parse_header_impl<R: DataReader>(data: &mut DataSource<R>) -> Result<u16> {
        let version: u16 = data
            .get(0..2)
            .wrap_err("Can't parse version bytes")?
            .as_le()
            .await?;

        let unknown: u16 = data
            .get(2..4)
            .wrap_err("Can't parse after-version bytes")?
            .as_le()
            .await?;

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

    pub async fn parse_header<R: DataReader>(content: &DataSource<R>) -> Result<u16> {
        Self::parse_header_impl(&mut content.get(..)?).await
    }

    pub async fn parse<R: DataReader>(
        content: &DataSource<R>,
        config: config::Config,
    ) -> Result<Self> {
        let mut data = content.get(..)?;

        let version = match Self::parse_header_impl(&mut data).await {
            Ok(v) => v,
            Err(err) => {
                let preview_len = content.size().min(32) as usize;
                let context = match content.read_at(0, preview_len, |b| b.to_vec()).await {
                    Ok(preview) => format!(
                        "Can't parse header, possibly corrupted data: {:02X?}",
                        preview
                    ),
                    Err(_) => "Can't parse header, possibly corrupted data".to_string(),
                };
                return Err(err.wrap_err(context));
            }
        };

        let mut lists = Vec::<DataListView>::with_capacity(config.lists.len());

        for list_config in config.lists.iter() {
            match DataListView::parse(&mut data, version, list_config).await {
                Ok(list) => lists.push(list),
                Err(err) => {
                    return Self::with_backtrace(
                        Err(err).wrap_err(eyre!("Can't parse list '{}'", list_config.caption)),
                        &lists,
                        &config,
                        content,
                    )
                    .await;
                }
            }
        }

        let rest_size = data.size();
        if rest_size > 0 {
            return Self::with_backtrace(
                Err(eyre!("Expected EOF, got {rest_size} bytes left")),
                &lists,
                &config,
                content,
            )
            .await;
        }

        Ok(Self {
            version,
            config,
            lists: lists.into(),
        })
    }

    pub async fn write<R: DataReader, W: Write>(
        &self,
        out: &mut BufWriter<W>,
        content: &DataSource<R>,
    ) -> Result<()> {
        out.write_le(self.version)?;
        out.write_le(Self::UNKNOWN)?;

        for list in self.lists.iter() {
            list.write(out, content).await?;
        }

        Ok(())
    }

    async fn with_backtrace<T, R: DataReader>(
        mut result: Result<T>,
        parsed_lists: &[DataListView],
        config: &config::Config,
        content: &DataSource<R>,
    ) -> Result<T> {
        for (list, config) in parsed_lists.iter().zip(config.lists.iter()).rev().take(3) {
            let entries = list.entries.read();

            let mut entry_strings = Vec::new();
            for (i, lazy_entry) in entries.iter().enumerate().rev().take(3) {
                entry_strings.push(match lazy_entry.resolve(content, config).await {
                    Ok(entry) => {
                        format!("#{}: {}", i + 1, entry.to_string(config, content))
                    }
                    Err(_) => format!("#{}: <unparsable>", i + 1),
                });
            }
            let presented_entries = entry_strings.join("\n");

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
    async fn parse<R: DataReader>(
        data: &mut DataSource<R>,
        version: u16,
        list_config: &config::ListConfig,
    ) -> Result<Self> {
        let prefix_len = match list_config.offset {
            config::ListOffset::Auto => match list_config.dt {
                // TODO: move to GameDialect
                util::DataType(1) if version >= 191 => {
                    8 + data.get(4..8)?.as_le::<u32>().await? as u64
                }
                util::DataType(21) => 8 + 4 + data.get(4..8)?.as_le::<u32>().await? as u64,
                util::DataType(101) => 8 + data.get(4..8)?.as_le::<u32>().await? as u64,
                _ => {
                    bail!(
                        "Unexpected element list #{dt} '{name}' with AUTO offset",
                        dt = list_config.dt.0,
                        name = list_config.caption
                    );
                }
            },
            config::ListOffset::Fixed(offset) => offset as u64,
        };

        let prefix = data.get(..prefix_len)?.to_bytes().await?;
        data.remove_prefix(prefix_len);

        // TODO: move to GameDialect
        if version >= 191 {
            let _list_index: u32 = data.get(..4)?.as_le().await?;
            data.remove_prefix(4);
        }

        let len = data.get(..4)?.as_le::<u32>().await? as usize;
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
                let entry_start = base_offset + entries.len() as u64 * fixed_size as u64;
                entries.push(LazyEntry::Deferred {
                    byte_range: entry_start..entry_start + fixed_size as u64,
                    parsed: OnceCell::new(),
                });
            }
            data.remove_prefix(len as u64 * fixed_size as u64);
        } else {
            // Slow path: variable-size entries, walk each to find boundaries
            for i in 0..len {
                let entry_start = data.base_offset();
                let entry_size = list_config
                    .compute_entry_byte_size(data)
                    .await
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
                    byte_range: entry_start..entry_start + entry_size as u64,
                    parsed: OnceCell::new(),
                });
                data.remove_prefix(entry_size as u64);
            }
        }

        Ok(Self {
            prefix,
            entries: Arc::new(RwLock::new(entries)),
            config: list_config.clone(),
            id_cache: Arc::new(RwLock::new(None)),
        })
    }

    pub async fn write<R: DataReader, W: Write>(
        &self,
        out: &mut BufWriter<W>,
        content: &DataSource<R>,
    ) -> Result<()> {
        let entries = self.entries.read();

        out.write_all(&self.prefix)?;
        out.write_le(entries.len() as u32)?;
        for entry in entries.iter() {
            entry.write(out, content).await?;
        }

        Ok(())
    }

    async fn build_id_cache<R: DataReader>(
        &self,
        content: &DataSource<R>,
    ) -> HashMap<u32, Vec<usize>> {
        let id_index = match self.config.find_field("ID") {
            Some(idx) => idx,
            None => return HashMap::new(),
        };

        let entries = self.entries.read();
        let mut cache: HashMap<u32, Vec<usize>> = HashMap::with_capacity(entries.len());

        for (i, lazy_entry) in entries.iter().enumerate() {
            let entry = match lazy_entry.resolve(content, &self.config).await {
                Ok(e) => e,
                Err(_) => continue,
            };
            let fields_guard = entry.fields.read();
            let Ok(bytes) = fields_guard[id_index].get_bytes(content).await else {
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

    pub async fn find_entries<R: DataReader>(
        &self,
        id: u32,
        content: &DataSource<R>,
    ) -> Vec<DataEntryView> {
        if self.config.find_field("ID").is_none() {
            return Default::default();
        }

        {
            let cache = self.id_cache.read();
            if let Some(ref map) = *cache {
                return self.lookup_cached_entries(map, id, content).await;
            }
        }

        let mut cache = self.id_cache.write();
        // Double-check: another thread may have populated the cache
        if cache.is_none() {
            *cache = Some(self.build_id_cache(content).await);
        }
        self.lookup_cached_entries(cache.as_ref().unwrap(), id, content)
            .await
    }

    async fn lookup_cached_entries<R: DataReader>(
        &self,
        cache: &HashMap<u32, Vec<usize>>,
        id: u32,
        content: &DataSource<R>,
    ) -> Vec<DataEntryView> {
        match cache.get(&id) {
            Some(indices) => {
                let entries = self.entries.read();
                let mut result = Vec::new();
                for &i in indices {
                    if let Some(lazy_entry) = entries.get(i)
                        && let Ok(entry) = lazy_entry.resolve(content, &self.config).await
                    {
                        result.push(entry.clone());
                    }
                }
                result
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

impl<R: DataReader> DataEntry<R> {
    pub async fn deep_clone(&self) -> Result<Self> {
        Ok(Self {
            content: self.content.get(..)?,
            view: self.view.deep_clone(&self.content).await?,
        })
    }
}

impl DataEntryView {
    fn new(fields: Vec<DataFieldView>) -> Self {
        Self {
            fields: Arc::new(RwLock::new(fields.into_boxed_slice())),
        }
    }

    async fn parse<R: DataReader>(
        data: &mut DataSource<R>,
        list_config: &config::ListConfig,
    ) -> Result<Self> {
        let mut fields = Vec::with_capacity(list_config.fields.len());
        for field in list_config.fields.iter() {
            fields.push(DataFieldView::parse(data, field).await?);
        }
        Ok(Self::new(fields))
    }

    pub async fn write<R: DataReader, W: Write>(
        &self,
        out: &mut BufWriter<W>,
        content: &DataSource<R>,
    ) -> Result<()> {
        for field in self.fields.read().iter() {
            field.write(out, content).await?;
        }

        Ok(())
    }

    async fn deep_clone<R: DataReader>(&self, content: &DataSource<R>) -> Result<Self> {
        let mut fields = Vec::new();
        for field in self.fields.read().iter() {
            fields.push(field.deep_clone(content).await?);
        }
        Ok(Self::new(fields))
    }

    pub fn to_string<R: DataReader>(
        &self,
        list_config: &config::ListConfig,
        content: &DataSource<R>,
    ) -> String {
        let meta_fields = &list_config.fields;

        let mut s = String::from("{");
        let mut sep = "";
        for (meta_field, field) in meta_fields.iter().zip(self.fields.read().iter()) {
            s.push_str(std::mem::replace(&mut sep, ", "));

            let bytes = match pollster::block_on(field.get_bytes(content)) {
                Ok(b) => b,
                Err(e) => {
                    write!(&mut s, "{}=<read_err={}>", &meta_field.name, e).unwrap();
                    continue;
                }
            };
            let value = meta_field.meta_type.read_value(&bytes);

            match value {
                Ok(value) => write!(&mut s, "{}={}", &meta_field.name, value).unwrap(),
                Err(err) => {
                    write!(&mut s, "{}=<err={:?}>", &meta_field.name, err.to_string()).unwrap()
                }
            }
        }
        s.push('}');
        s
    }
}

impl DataFieldView {
    fn from_source<R: DataReader>(source: &DataSource<R>) -> Self {
        DataFieldView::ByteRange {
            range: source.base_offset()..source.base_offset() + source.size(),
        }
    }

    async fn parse<R: DataReader>(
        data: &mut DataSource<R>,
        field: &meta::MetaField,
    ) -> Result<Self> {
        let byte_size = field.meta_type.get_byte_size(data).await?;
        let field_data = data.get(..byte_size as u64)?;

        data.remove_prefix(byte_size as u64);

        Ok(DataFieldView::from_source(&field_data))
    }

    pub async fn get_bytes<R: DataReader>(&self, content: &DataSource<R>) -> Result<Vec<u8>> {
        match self {
            DataFieldView::ByteRange { range } => {
                content
                    .read_at(range.start, (range.end - range.start) as usize, |b| {
                        b.to_vec()
                    })
                    .await
            }
            DataFieldView::Bytes(bytes) => Ok(bytes.to_vec()),
        }
    }

    pub async fn write<R: DataReader, W: Write>(
        &self,
        out: &mut BufWriter<W>,
        content: &DataSource<R>,
    ) -> Result<()> {
        match self {
            DataFieldView::ByteRange { range } => {
                content
                    .read_at(range.start, (range.end - range.start) as usize, |b| {
                        out.write_all(b)
                    })
                    .await??;
            }
            DataFieldView::Bytes(bytes) => out.write_all(bytes)?,
        }
        Ok(())
    }

    async fn deep_clone<R: DataReader>(&self, content: &DataSource<R>) -> Result<Self> {
        let bytes = self.get_bytes(content).await?;
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

    fn parse_v7() -> (DataView, DataSource<Vec<u8>>) {
        let bytes = include_test_data_bytes!("elements/elements_v7.data");
        let content = DataSource::from_bytes(bytes.to_vec());
        let data = pollster::block_on(DataView::parse(&content, parse_v7_config())).unwrap();
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
        pollster::block_on(data.write(&mut BufWriter::new(&mut output), &content)).unwrap();
        assert_eq!(content.to_bytes_blocking().unwrap(), output);
    }

    #[test]
    fn roundtrip_with_partial_access() {
        let (data, content) = parse_v7();
        // Access only the first entry of the first non-empty list
        for list in data.lists.iter() {
            let entries = list.entries.read();
            if !entries.is_empty() {
                let _ = pollster::block_on(entries[0].resolve(&content, &list.config)).unwrap();
                break;
            }
        }
        let mut output = Vec::new();
        pollster::block_on(data.write(&mut BufWriter::new(&mut output), &content)).unwrap();
        assert_eq!(content.to_bytes_blocking().unwrap(), output);
    }

    #[test]
    fn parse_empty_data() {
        let content = DataSource::from_bytes(b"".to_vec());
        let result = pollster::block_on(DataView::parse(&content, parse_v7_config()));
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
        let result = pollster::block_on(DataView::parse(&content, parse_v7_config()));
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
        let result = pollster::block_on(DataView::parse(&content, parse_v7_config()));
        let err = result.err().expect("expected error for bad UNKNOWN field");
        assert!(
            format!("{err:?}").contains("Unexpected header"),
            "unexpected error: {err:?}"
        );
    }

    #[test]
    fn parse_mismatched_config_returns_error() {
        // v29 data with v7 config — must return Err, not panic
        let bytes = include_test_data_bytes!("elements/elements_v29.data");
        let content = DataSource::from_bytes(bytes.to_vec());
        let config = config::Config::parse(
            include_resources_str!("known_configs/PW_1.2.2_v7.cfg"),
            None,
            GameDialectRef::PW,
        )
        .unwrap();
        let result = pollster::block_on(DataView::parse(&content, config));
        assert!(
            result.is_err(),
            "expected error for mismatched config, got Ok"
        );
    }
}
