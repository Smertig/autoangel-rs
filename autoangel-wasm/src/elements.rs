use crate::file_reader::BufferedFileReader;
use crate::opfs::{self, OpfsReader};
use autoangel_core::elements::{config, data, game::GameDialectRef, value::ReadValue};
use autoangel_core::util::data_source::{DataReader, DataSource, MultiReader};
use std::io::BufWriter;
use wasm_bindgen::prelude::*;
use web_sys::FileSystemSyncAccessHandle;

/// Configuration for parsing elements.data files.
#[wasm_bindgen]
pub struct ElementsConfig {
    config: config::Config,
}

#[wasm_bindgen]
impl ElementsConfig {
    /// Parse a config from its text content.
    /// `game` must be `"pw"` (Perfect World). More games may be supported in the future.
    #[wasm_bindgen]
    pub fn parse(content: &str, game: &str) -> Result<ElementsConfig, JsError> {
        let dialect = GameDialectRef::get(game)
            .ok_or_else(|| JsError::new(&format!("unknown game dialect: '{game}'")))?;

        let config =
            config::Config::parse(content, None, dialect).map_err(|e| crate::format_error(&e))?;

        Ok(ElementsConfig { config })
    }

    /// Config name, if available.
    #[wasm_bindgen(getter)]
    pub fn name(&self) -> Option<String> {
        self.config.name.clone()
    }

    /// Number of lists in this config.
    #[wasm_bindgen(getter, js_name = "listCount")]
    pub fn list_count(&self) -> usize {
        self.config.lists.len()
    }
}

/// Type-erased content wrapper for elements data.
/// Holds either an in-memory or OPFS-backed DataSource.
enum ElementsContent {
    Memory(DataSource<Vec<u8>>),
    Opfs(DataSource<MultiReader<OpfsReader>>),
    File(DataSource<MultiReader<BufferedFileReader>>),
}

impl Clone for ElementsContent {
    fn clone(&self) -> Self {
        match self {
            ElementsContent::Memory(ds) => ElementsContent::Memory(ds.get(..).unwrap()),
            ElementsContent::Opfs(ds) => ElementsContent::Opfs(ds.get(..).unwrap()),
            ElementsContent::File(ds) => ElementsContent::File(ds.get(..).unwrap()),
        }
    }
}

macro_rules! with_content {
    ($content:expr, |$c:ident| $body:expr) => {
        match $content {
            ElementsContent::Memory(ref $c) => $body,
            ElementsContent::Opfs(ref $c) => $body,
            ElementsContent::File(ref $c) => $body,
        }
    };
}

/// Resolve config: use provided config, or auto-detect from data header.
async fn resolve_config<R: DataReader>(
    content: &DataSource<R>,
    config: Option<ElementsConfig>,
) -> Result<config::Config, JsError> {
    match config {
        Some(c) => Ok(c.config),
        None => {
            let version = data::DataView::parse_header(content)
                .await
                .map_err(|e| crate::format_error(&e))?;
            config::Config::find_bundled(version)
                .ok_or_else(|| JsError::new(&format!("no bundled config for v{version}")))
        }
    }
}

/// Parsed elements.data file.
#[wasm_bindgen]
pub struct ElementsData {
    version: u16,
    config: config::Config,
    lists: std::sync::Arc<[data::DataListView]>,
    content: ElementsContent,
}

#[wasm_bindgen]
impl ElementsData {
    /// Parse elements.data from a byte array (loads entire file into WASM memory).
    /// If `config` is not provided, a bundled config is chosen based on the data version.
    #[wasm_bindgen]
    pub async fn parse(
        bytes: &[u8],
        config: Option<ElementsConfig>,
    ) -> Result<ElementsData, JsError> {
        let content = DataSource::from_bytes(bytes.to_vec());
        let config = resolve_config(&content, config).await?;
        let view = data::DataView::parse(&content, config)
            .await
            .map_err(|e| crate::format_error(&e))?;

        Ok(ElementsData {
            version: view.version,
            config: view.config,
            lists: view.lists,
            content: ElementsContent::Memory(content),
        })
    }

    /// Open elements.data from an OPFS sync access handle (Web Worker only).
    /// The file is NOT loaded into memory — reads happen on demand.
    /// If `config` is not provided, the header is read to determine the version.
    #[wasm_bindgen(js_name = "open")]
    pub async fn open(
        handle: FileSystemSyncAccessHandle,
        config: Option<ElementsConfig>,
    ) -> Result<ElementsData, JsError> {
        let content =
            opfs::data_source_from_handles(vec![handle]).map_err(|e| crate::format_error(&e))?;
        let config = resolve_config(&content, config).await?;
        let view = data::DataView::parse(&content, config)
            .await
            .map_err(|e| crate::format_error(&e))?;

        Ok(ElementsData {
            version: view.version,
            config: view.config,
            lists: view.lists,
            content: ElementsContent::Opfs(content),
        })
    }

    /// Open elements.data from a JS File object (main thread, no OPFS needed).
    /// The file is NOT loaded into memory — reads happen on demand with buffering.
    /// If `config` is not provided, the header is read to determine the version.
    #[wasm_bindgen(js_name = "openFile")]
    pub async fn open_file(
        file: web_sys::File,
        config: Option<ElementsConfig>,
    ) -> Result<ElementsData, JsError> {
        let content = crate::file_reader::data_source_from_files(vec![file]);
        let cfg = resolve_config(&content, config).await?;
        let view = data::DataView::parse(&content, cfg)
            .await
            .map_err(|e| crate::format_error(&e))?;

        Ok(ElementsData {
            version: view.version,
            config: view.config,
            lists: view.lists,
            content: ElementsContent::File(content),
        })
    }

    /// Data version number.
    #[wasm_bindgen(getter)]
    pub fn version(&self) -> u16 {
        self.version
    }

    /// Number of lists.
    #[wasm_bindgen(getter, js_name = "listCount")]
    pub fn list_count(&self) -> usize {
        self.lists.len()
    }

    /// Get a list by index.
    #[wasm_bindgen(js_name = "getList")]
    pub fn get_list(&self, index: usize) -> Result<ElementsDataList, JsError> {
        if index >= self.lists.len() {
            return Err(JsError::new(&format!(
                "list index {index} out of range ({})",
                self.lists.len()
            )));
        }

        Ok(ElementsDataList {
            content: self.content.clone(),
            list: self.lists[index].clone(),
        })
    }

    /// Save elements.data to a byte array.
    #[wasm_bindgen(js_name = "saveBytes")]
    pub async fn save_bytes(&self) -> Result<Vec<u8>, JsError> {
        let mut buffer = Vec::new();
        let view = data::DataView {
            version: self.version,
            config: self.config.clone(),
            lists: self.lists.clone(),
        };
        with_content!(self.content, |c| {
            view.write(&mut BufWriter::new(&mut buffer), c)
                .await
                .map_err(|e| crate::format_error(&e))?;
        });
        Ok(buffer)
    }

    /// Find an entry by ID across all lists.
    #[wasm_bindgen(js_name = "findEntry")]
    pub async fn find_entry(&self, id: u32) -> Option<ElementsDataEntry> {
        // Inline the find logic since Data<R>::find_entry needs a concrete R.
        for (i, list) in self.lists.iter().enumerate() {
            let entries = with_content!(self.content, |c| { list.find_entries(id, c).await });
            if let Some(entry_view) = entries.into_iter().next() {
                return Some(ElementsDataEntry {
                    list_config: self.lists[i].config.clone(),
                    inner: entry_view,
                    content: self.content.clone(),
                });
            }
        }
        None
    }
}

/// A single list within elements.data.
#[wasm_bindgen]
pub struct ElementsDataList {
    content: ElementsContent,
    list: data::DataListView,
}

#[wasm_bindgen]
impl ElementsDataList {
    /// List caption/name.
    #[wasm_bindgen(getter)]
    pub fn caption(&self) -> String {
        self.list.config.caption.to_string()
    }

    /// Number of entries.
    #[wasm_bindgen(getter, js_name = "entryCount")]
    pub fn entry_count(&self) -> usize {
        self.list.entries.read().len()
    }

    /// Get an entry by index.
    #[wasm_bindgen(js_name = "getEntry")]
    #[allow(clippy::await_holding_lock)] // WASM is single-threaded; parking_lot RwLock is not async-aware
    pub async fn get_entry(&self, index: usize) -> Result<ElementsDataEntry, JsError> {
        let len = self.list.entries.read().len();
        if index >= len {
            return Err(JsError::new(&format!(
                "entry index {index} out of range ({len})",
            )));
        }

        let entry_view = with_content!(self.content, |c| {
            let entries = self.list.entries.read();
            let lazy = &entries[index];
            lazy.resolve(c, &self.list.config)
                .await
                .map_err(|e| crate::format_error(&e))?
                .clone()
        });

        Ok(ElementsDataEntry {
            list_config: self.list.config.clone(),
            inner: entry_view,
            content: self.content.clone(),
        })
    }

    /// Field names for entries in this list.
    #[wasm_bindgen(js_name = "fieldNames")]
    pub fn field_names(&self) -> Vec<String> {
        self.list
            .config
            .fields
            .iter()
            .map(|f| f.name.clone())
            .collect()
    }
}

/// A single entry (row) within a data list.
#[wasm_bindgen]
pub struct ElementsDataEntry {
    list_config: config::ListConfig,
    inner: data::DataEntryView,
    content: ElementsContent,
}

#[wasm_bindgen]
impl ElementsDataEntry {
    /// Get a field value by name. Returns a JS value (number, string, or Uint8Array).
    #[wasm_bindgen(js_name = "getField")]
    #[allow(clippy::await_holding_lock)] // WASM is single-threaded
    pub async fn get_field(&self, name: &str) -> Result<JsValue, JsError> {
        let index = self
            .list_config
            .find_field(name)
            .ok_or_else(|| JsError::new(&format!("unknown field: '{name}'")))?;

        let fields = self.inner.fields.read();
        let bytes = with_content!(self.content, |c| {
            fields[index]
                .get_bytes(c)
                .await
                .map_err(|e| crate::format_error(&e))?
        });
        let value = self.list_config.fields[index]
            .meta_type
            .read_value(&bytes)
            .map_err(|e| crate::format_error(&e))?;

        Ok(read_value_to_js(value))
    }

    /// Get all field names.
    #[wasm_bindgen]
    pub fn keys(&self) -> Vec<String> {
        self.list_config
            .fields
            .iter()
            .map(|f| f.name.clone())
            .collect()
    }

    /// String representation of this entry.
    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        with_content!(self.content, |c| {
            self.inner.to_string(&self.list_config, c)
        })
    }
}

fn read_value_to_js(value: ReadValue) -> JsValue {
    match value {
        ReadValue::Integer(v) => JsValue::from_f64(v as f64),
        ReadValue::Float(v) => JsValue::from_f64(v as f64),
        ReadValue::Double(v) => JsValue::from_f64(v),
        ReadValue::String(v) => JsValue::from_str(&v),
        ReadValue::Bytes(v) => {
            let array = js_sys::Uint8Array::new_with_length(v.len() as u32);
            array.copy_from(&v);
            array.into()
        }
    }
}
