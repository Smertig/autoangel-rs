use crate::opfs;
use autoangel_core::pck::package;
use autoangel_core::util::data_source::DataSource;
use wasm_bindgen::prelude::*;
use web_sys::FileSystemSyncAccessHandle;

/// Configuration for pck package parsing (encryption keys and guards).
#[wasm_bindgen]
pub struct PackageConfig {
    config: package::PackageConfig,
}

impl Default for PackageConfig {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl PackageConfig {
    /// Create a new PackageConfig with default keys.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            config: package::PackageConfig::default(),
        }
    }

    /// Create a PackageConfig with custom keys.
    #[wasm_bindgen(js_name = "withKeys")]
    pub fn with_keys(key1: u32, key2: u32, guard1: u32, guard2: u32) -> Self {
        Self {
            config: package::PackageConfig {
                key1,
                key2,
                guard1,
                guard2,
            },
        }
    }

    #[wasm_bindgen(getter)]
    pub fn key1(&self) -> u32 {
        self.config.key1
    }

    #[wasm_bindgen(getter)]
    pub fn key2(&self) -> u32 {
        self.config.key2
    }

    #[wasm_bindgen(getter)]
    pub fn guard1(&self) -> u32 {
        self.config.guard1
    }

    #[wasm_bindgen(getter)]
    pub fn guard2(&self) -> u32 {
        self.config.guard2
    }
}

/// Parsed pck/pkx package.
#[wasm_bindgen]
pub struct PckPackage {
    content: DataSource,
    info: package::PackageInfo,
}

#[wasm_bindgen]
impl PckPackage {
    /// Parse a pck package from bytes (loads entire file into WASM memory).
    #[wasm_bindgen]
    pub fn parse(bytes: &[u8], config: Option<PackageConfig>) -> Result<PckPackage, JsError> {
        let config = config.map_or_else(Default::default, |c| c.config);
        let content = DataSource::from_bytes(bytes.to_vec());
        Self::from_data_source(content, config)
    }

    /// Open a pck package from an OPFS sync access handle (Web Worker only).
    /// The file is NOT loaded into memory — reads happen on demand.
    #[wasm_bindgen(js_name = "open")]
    pub fn open(
        handle: FileSystemSyncAccessHandle,
        config: Option<PackageConfig>,
    ) -> Result<PckPackage, JsError> {
        let config = config.map_or_else(Default::default, |c| c.config);
        let content = opfs::data_source_from_handle(handle).map_err(|e| crate::format_error(&e))?;
        Self::from_data_source(content, config)
    }

    /// Open a pck+pkx pair from two OPFS sync access handles (Web Worker only).
    #[wasm_bindgen(js_name = "open2")]
    pub fn open2(
        pck_handle: FileSystemSyncAccessHandle,
        pkx_handle: FileSystemSyncAccessHandle,
        config: Option<PackageConfig>,
    ) -> Result<PckPackage, JsError> {
        let config = config.map_or_else(Default::default, |c| c.config);
        let content = opfs::data_source_from_handles(pck_handle, pkx_handle)
            .map_err(|e| crate::format_error(&e))?;
        Self::from_data_source(content, config)
    }

    fn from_data_source(
        content: DataSource,
        config: package::PackageConfig,
    ) -> Result<PckPackage, JsError> {
        let info =
            package::PackageInfo::parse(&content, config).map_err(|e| crate::format_error(&e))?;
        Ok(PckPackage { content, info })
    }

    /// Package version.
    #[wasm_bindgen(getter)]
    pub fn version(&self) -> u32 {
        self.info.version()
    }

    /// Number of files in the package.
    #[wasm_bindgen(getter, js_name = "fileCount")]
    pub fn file_count(&self) -> usize {
        self.info.file_count()
    }

    /// Get decompressed file content by path. Returns null if not found.
    #[wasm_bindgen(js_name = "getFile")]
    pub fn get_file(&self, path: &str) -> Option<Vec<u8>> {
        self.info
            .get_file(&self.content, path)
            .map(|cow| cow.into_owned())
    }

    /// Find files matching a path prefix. Returns an array of normalized file paths.
    #[wasm_bindgen(js_name = "findPrefix")]
    pub fn find_prefix(&self, prefix: &str) -> Vec<String> {
        self.info
            .find_prefix(prefix)
            .iter()
            .map(|e| e.normalized_name.clone())
            .collect()
    }

    /// List all file paths in the package.
    #[wasm_bindgen(js_name = "fileList")]
    pub fn file_list(&self) -> Vec<String> {
        self.find_prefix("")
    }
}
