use crate::opfs;
use autoangel_core::elements::{config, data, game::GameDialectRef, value::ReadValue};
use autoangel_core::util::data_source::DataSource;
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

/// Parsed elements.data file.
#[wasm_bindgen]
pub struct ElementsData {
    inner: data::Data,
}

/// Resolve config: use provided config, or auto-detect from data header.
fn resolve_config(
    content: &DataSource,
    config: Option<ElementsConfig>,
) -> Result<config::Config, JsError> {
    match config {
        Some(c) => Ok(c.config),
        None => {
            let version =
                data::DataView::parse_header(content).map_err(|e| crate::format_error(&e))?;
            config::Config::find_bundled(version)
                .ok_or_else(|| JsError::new(&format!("no bundled config for v{version}")))
        }
    }
}

#[wasm_bindgen]
impl ElementsData {
    /// Parse elements.data from a byte array (loads entire file into WASM memory).
    /// If `config` is not provided, a bundled config is chosen based on the data version.
    #[wasm_bindgen]
    pub fn parse(bytes: &[u8], config: Option<ElementsConfig>) -> Result<ElementsData, JsError> {
        let content = DataSource::from_bytes(bytes.to_vec());
        let config = resolve_config(&content, config)?;
        let view = data::DataView::parse(&content, config).map_err(|e| crate::format_error(&e))?;

        Ok(ElementsData {
            inner: data::Data::from(view, content),
        })
    }

    /// Open elements.data from an OPFS sync access handle (Web Worker only).
    /// The file is NOT loaded into memory — reads happen on demand.
    /// If `config` is not provided, the header is read to determine the version.
    #[wasm_bindgen(js_name = "open")]
    pub fn open(
        handle: FileSystemSyncAccessHandle,
        config: Option<ElementsConfig>,
    ) -> Result<ElementsData, JsError> {
        let content = opfs::data_source_from_handle(handle).map_err(|e| crate::format_error(&e))?;
        let config = resolve_config(&content, config)?;
        let view = data::DataView::parse(&content, config).map_err(|e| crate::format_error(&e))?;

        Ok(ElementsData {
            inner: data::Data::from(view, content),
        })
    }

    /// Data version number.
    #[wasm_bindgen(getter)]
    pub fn version(&self) -> u16 {
        self.inner.version
    }

    /// Number of lists.
    #[wasm_bindgen(getter, js_name = "listCount")]
    pub fn list_count(&self) -> usize {
        self.inner.lists.len()
    }

    /// Get a list by index.
    #[wasm_bindgen(js_name = "getList")]
    pub fn get_list(&self, index: usize) -> Result<ElementsDataList, JsError> {
        if index >= self.inner.lists.len() {
            return Err(JsError::new(&format!(
                "list index {index} out of range ({})",
                self.inner.lists.len()
            )));
        }

        Ok(ElementsDataList {
            content: self.inner.content.clone(),
            list: self.inner.lists[index].clone(),
        })
    }

    /// Save elements.data to a byte array.
    #[wasm_bindgen(js_name = "saveBytes")]
    pub fn save_bytes(&self) -> Result<Vec<u8>, JsError> {
        let mut buffer = Vec::new();
        self.inner
            .write(&mut std::io::BufWriter::new(&mut buffer))
            .map_err(|e| crate::format_error(&e))?;
        Ok(buffer)
    }

    /// Find an entry by ID across all lists.
    #[wasm_bindgen(js_name = "findEntry")]
    pub fn find_entry(&self, id: u32) -> Option<ElementsDataEntry> {
        self.inner
            .find_entry(id, None, true)
            .map(|(i, entry)| ElementsDataEntry {
                list_config: self.inner.lists[i].config.clone(),
                inner: entry,
            })
    }
}

/// A single list within elements.data.
#[wasm_bindgen]
pub struct ElementsDataList {
    content: DataSource,
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
    pub fn get_entry(&self, index: usize) -> Result<ElementsDataEntry, JsError> {
        let entries = self.list.entries.read();
        if index >= entries.len() {
            return Err(JsError::new(&format!(
                "entry index {index} out of range ({})",
                entries.len()
            )));
        }

        let entry_view = entries[index]
            .resolve(&self.content, &self.list.config)
            .map_err(|e| crate::format_error(&e))?
            .clone();

        Ok(ElementsDataEntry {
            list_config: self.list.config.clone(),
            inner: data::DataEntry::from(entry_view, self.content.clone()),
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
    inner: data::DataEntry,
}

#[wasm_bindgen]
impl ElementsDataEntry {
    /// Get a field value by name. Returns a JS value (number, string, or Uint8Array).
    #[wasm_bindgen(js_name = "getField")]
    pub fn get_field(&self, name: &str) -> Result<JsValue, JsError> {
        let index = self
            .list_config
            .find_field(name)
            .ok_or_else(|| JsError::new(&format!("unknown field: '{name}'")))?;

        let fields = self.inner.fields.read();
        let bytes = fields[index]
            .get_bytes(&self.inner.content)
            .map_err(|e| crate::format_error(&e))?;
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
        self.inner.to_string(&self.list_config, &self.inner.content)
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
