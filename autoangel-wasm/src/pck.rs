use crate::opfs;
use autoangel_core::pck::package;
use autoangel_core::pck::package::{FileEntriesOptions, FileEntriesProgressFn, FileEntryProgress};
use autoangel_core::util::data_source::DataSource;
use js_sys;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::FileSystemSyncAccessHandle;

/// Metadata for a single file entry in a pck package.
#[wasm_bindgen]
pub struct FileEntry {
    path: String,
    size: u32,
    compressed_size: u32,
    hash: u32,
}

#[wasm_bindgen]
impl FileEntry {
    /// Normalized file path (lowercase, backslash-separated).
    #[wasm_bindgen(getter)]
    pub fn path(&self) -> String {
        self.path.clone()
    }

    /// Uncompressed file size in bytes.
    #[wasm_bindgen(getter)]
    pub fn size(&self) -> u32 {
        self.size
    }

    /// Compressed file size in bytes.
    #[wasm_bindgen(getter, js_name = "compressedSize")]
    pub fn compressed_size(&self) -> u32 {
        self.compressed_size
    }

    /// CRC32 hash of the decompressed file content.
    #[wasm_bindgen(getter)]
    pub fn hash(&self) -> u32 {
        self.hash
    }
}

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

    /// Open a pck package from OPFS sync access handles (Web Worker only).
    /// Second argument is an optional options object: `{ pkxHandles?: FileSystemSyncAccessHandle[], config?: PackageConfig }`.
    #[wasm_bindgen(js_name = "open")]
    pub fn open(
        pck_handle: FileSystemSyncAccessHandle,
        options: Option<JsValue>,
    ) -> Result<PckPackage, JsError> {
        let mut handles = vec![pck_handle];
        let mut config_val = None;

        if let Some(ref opts) = options.filter(|o| o.is_object()) {
            // Extract pkxHandles array
            if let Some(arr) = js_sys::Reflect::get(opts, &"pkxHandles".into())
                .ok()
                .and_then(|v| v.dyn_into::<js_sys::Array>().ok())
            {
                for i in 0..arr.length() {
                    let h: FileSystemSyncAccessHandle = arr.get(i).unchecked_into();
                    handles.push(h);
                }
            }
            // Extract config: read key1/key2/guard1/guard2 fields via Reflect
            if let Some(cfg_val) = js_sys::Reflect::get(opts, &"config".into())
                .ok()
                .filter(|v| v.is_object())
            {
                let get_u32 = |obj: &JsValue, key: &str| -> Option<u32> {
                    js_sys::Reflect::get(obj, &key.into())
                        .ok()
                        .and_then(|v| v.as_f64())
                        .map(|v| v as u32)
                };
                if let (Some(k1), Some(k2), Some(g1), Some(g2)) = (
                    get_u32(&cfg_val, "key1"),
                    get_u32(&cfg_val, "key2"),
                    get_u32(&cfg_val, "guard1"),
                    get_u32(&cfg_val, "guard2"),
                ) {
                    config_val = Some(PackageConfig::with_keys(k1, k2, g1, g2));
                }
            }
        }

        let config = config_val.map_or_else(Default::default, |c| c.config);
        let content =
            opfs::data_source_from_handles(handles).map_err(|e| crate::format_error(&e))?;
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

    /// List all file entries with metadata (including content CRC32 hashes).
    /// This decompresses every file to compute hashes.
    #[wasm_bindgen(js_name = "fileEntries")]
    pub fn file_entries(&self, options: Option<JsValue>) -> Result<Vec<FileEntry>, JsError> {
        let on_progress_fn = options.and_then(|opts| {
            if !opts.is_object() {
                return None;
            }
            js_sys::Reflect::get(&opts, &"onProgress".into())
                .ok()
                .and_then(|v| v.dyn_into::<js_sys::Function>().ok())
        });

        let options = FileEntriesOptions {
            on_progress: on_progress_fn.map(|func| -> FileEntriesProgressFn {
                Box::new(move |p: FileEntryProgress| {
                    func.call3(
                        &JsValue::NULL,
                        &p.path.into(),
                        &JsValue::from(p.index as f64),
                        &JsValue::from(p.total as f64),
                    )
                    .map_err(|e| eyre::eyre!("{:?}", e))?;
                    Ok(())
                })
            }),
        };

        let entries = self
            .info
            .file_entries(&self.content, options)
            .map_err(|e| crate::format_error(&e))?;

        Ok(entries
            .into_iter()
            .map(|e| FileEntry {
                path: e.path.to_owned(),
                size: e.size,
                compressed_size: e.compressed_size,
                hash: e.hash,
            })
            .collect())
    }
}
