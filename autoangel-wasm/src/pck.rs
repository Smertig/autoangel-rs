use crate::file_reader::BufferedFileReader;
use autoangel_core::pck::builder::PackageBuilder;
use autoangel_core::pck::package;
use autoangel_core::pck::package::{
    FileEntrySummary, PackageSource, ParseOptions, ParseProgress, ParseProgressFn,
    ScanEntriesOptions,
};
use autoangel_core::util::data_source::{DataReader, DataSource, MultiReader};
use js_sys;
use std::sync::Arc;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

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

    /// CRC32 hash of the compressed (on-disk) file data.
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

fn make_parse_options(options: &Option<JsValue>) -> ParseOptions {
    let opts = options.as_ref().filter(|o| o.is_object());

    let on_progress_fn = opts.and_then(|opts| {
        js_sys::Reflect::get(opts, &"onProgress".into())
            .ok()
            .and_then(|v| v.dyn_into::<js_sys::Function>().ok())
    });

    let progress_interval_ms = opts
        .and_then(|opts| {
            js_sys::Reflect::get(opts, &"progressIntervalMs".into())
                .ok()
                .and_then(|v| v.as_f64())
        })
        .unwrap_or(0.0) as u32;

    ParseOptions {
        on_progress: on_progress_fn.map(|func| -> ParseProgressFn {
            Box::new(move |p: ParseProgress| {
                func.call2(
                    &JsValue::NULL,
                    &JsValue::from(p.index as f64),
                    &JsValue::from(p.total as f64),
                )
                .map_err(|e| eyre::eyre!("{:?}", e))?;
                Ok(())
            })
        }),
        progress_interval_ms,
    }
}

enum AnyPackageSource {
    Memory(Arc<PackageSource<Vec<u8>>>),
    File(Arc<PackageSource<MultiReader<BufferedFileReader>>>),
}

macro_rules! with_source {
    ($source:expr, |$s:ident| $body:expr) => {
        match &$source {
            AnyPackageSource::Memory($s) => $body,
            AnyPackageSource::File($s) => $body,
        }
    };
}

// -- Async helper functions for dispatching across content variants --

async fn get_file_inner<R: DataReader>(
    info: &package::PackageInfo,
    content: &DataSource<R>,
    path: &str,
) -> Option<Vec<u8>> {
    info.get_file(content, path).await
}

async fn scan_entries_inner<R: DataReader>(
    info: &package::PackageInfo,
    content: &DataSource<R>,
    paths: Vec<String>,
    on_chunk_fn: js_sys::Function,
    interval_ms: u32,
) -> Result<(), JsError> {
    let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();

    let options = ScanEntriesOptions {
        on_chunk: Box::new(move |entries: &[FileEntrySummary]| {
            let arr = js_sys::Array::new_with_length(entries.len() as u32);
            for (i, e) in entries.iter().enumerate() {
                let fe = FileEntry {
                    path: e.path.to_owned(),
                    size: e.size,
                    compressed_size: e.compressed_size,
                    hash: e.hash,
                };
                arr.set(i as u32, fe.into());
            }
            on_chunk_fn
                .call1(&JsValue::NULL, &arr)
                .map_err(|e| eyre::eyre!("{:?}", e))?;
            Ok(())
        }),
        interval_ms,
    };

    info.scan_entries(content, &path_refs, options)
        .await
        .map_err(|e| crate::format_error(&e))?;

    Ok(())
}

/// Parsed pck/pkx package.
#[wasm_bindgen]
pub struct PckPackage {
    source: AnyPackageSource,
}

#[wasm_bindgen]
impl PckPackage {
    /// Parse a pck package from bytes (loads entire file into WASM memory).
    /// Third argument is an optional options object: `{ onProgress?: (index: number, total: number) => void, progressIntervalMs?: number }`.
    #[wasm_bindgen]
    pub async fn parse(
        bytes: &[u8],
        config: Option<PackageConfig>,
        options: Option<JsValue>,
    ) -> Result<PckPackage, JsError> {
        let config = config.map_or_else(Default::default, |c| c.config);
        let content = DataSource::from_bytes(bytes.to_vec());
        let parse_options = make_parse_options(&options);
        let info = package::PackageInfo::parse(&content, config, parse_options)
            .await
            .map_err(|e| crate::format_error(&e))?;
        Ok(PckPackage {
            source: AnyPackageSource::Memory(Arc::new(PackageSource { info, content })),
        })
    }

    /// Package version.
    #[wasm_bindgen(getter)]
    pub fn version(&self) -> u32 {
        with_source!(self.source, |s| s.info.version())
    }

    /// Number of files in the package.
    #[wasm_bindgen(getter, js_name = "fileCount")]
    pub fn file_count(&self) -> usize {
        with_source!(self.source, |s| s.info.file_count())
    }

    /// Get decompressed file content by path. Returns null if not found.
    #[wasm_bindgen(js_name = "getFile")]
    pub async fn get_file(&self, path: &str) -> Option<Vec<u8>> {
        match &self.source {
            AnyPackageSource::Memory(s) => get_file_inner(&s.info, &s.content, path).await,
            AnyPackageSource::File(s) => get_file_inner(&s.info, &s.content, path).await,
        }
    }

    /// Find files matching a path prefix. Returns an array of normalized file paths.
    #[wasm_bindgen(js_name = "findPrefix")]
    pub fn find_prefix(&self, prefix: &str) -> Vec<String> {
        with_source!(self.source, |s| s
            .info
            .find_prefix(prefix)
            .iter()
            .map(|e| e.normalized_name.clone())
            .collect())
    }

    /// List all file paths in the package.
    #[wasm_bindgen(js_name = "fileList")]
    pub fn file_list(&self) -> Vec<String> {
        self.find_prefix("")
    }

    /// Scan file entries with streaming chunks. Each chunk delivers an array of FileEntry objects.
    /// Options: `{ onChunk: (entries: FileEntry[]) => void, intervalMs: number, paths: string[] }`.
    #[wasm_bindgen(js_name = "scanEntries")]
    pub async fn scan_entries(&self, options: JsValue) -> Result<(), JsError> {
        if !options.is_object() {
            return Err(JsError::new("scanEntries requires an options object"));
        }

        let on_chunk_fn = js_sys::Reflect::get(&options, &"onChunk".into())
            .ok()
            .and_then(|v| v.dyn_into::<js_sys::Function>().ok())
            .ok_or_else(|| JsError::new("scanEntries requires onChunk callback"))?;

        let interval_ms = js_sys::Reflect::get(&options, &"intervalMs".into())
            .ok()
            .and_then(|v| v.as_f64())
            .ok_or_else(|| JsError::new("scanEntries requires intervalMs number"))?
            as u32;

        let paths: Vec<String> = js_sys::Reflect::get(&options, &"paths".into())
            .ok()
            .and_then(|v| v.dyn_into::<js_sys::Array>().ok())
            .map(|arr| {
                (0..arr.length())
                    .filter_map(|i| arr.get(i).as_string())
                    .collect()
            })
            .ok_or_else(|| JsError::new("scanEntries requires paths array"))?;

        match &self.source {
            AnyPackageSource::Memory(s) => {
                scan_entries_inner(&s.info, &s.content, paths, on_chunk_fn, interval_ms).await
            }
            AnyPackageSource::File(s) => {
                scan_entries_inner(&s.info, &s.content, paths, on_chunk_fn, interval_ms).await
            }
        }
    }

    /// Open a pck package from JS File objects (main thread, no OPFS needed).
    /// Second argument is an optional options object: `{ pkxFiles?: File[], config?: PackageConfig, onProgress?: (index: number, total: number) => void, progressIntervalMs?: number }`.
    #[wasm_bindgen(js_name = "openFile")]
    pub async fn open_file(
        pck_file: web_sys::File,
        options: Option<JsValue>,
    ) -> Result<PckPackage, JsError> {
        let parse_options = make_parse_options(&options);
        let mut files = vec![pck_file];
        let mut config_val = None;

        if let Some(ref opts) = options.filter(|o| o.is_object()) {
            // Extract pkxFiles array
            if let Some(arr) = js_sys::Reflect::get(opts, &"pkxFiles".into())
                .ok()
                .and_then(|v| v.dyn_into::<js_sys::Array>().ok())
            {
                for i in 0..arr.length() {
                    let f: web_sys::File = arr.get(i).unchecked_into();
                    files.push(f);
                }
            }
            // Extract config
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
        let content = crate::file_reader::data_source_from_files(files);
        let info = package::PackageInfo::parse(&content, config, parse_options)
            .await
            .map_err(|e| crate::format_error(&e))?;
        Ok(PckPackage {
            source: AnyPackageSource::File(Arc::new(PackageSource { info, content })),
        })
    }

    /// Create a builder pre-populated with this package's files.
    #[wasm_bindgen(js_name = "toBuilder")]
    pub fn to_builder(&self) -> PckBuilder {
        match &self.source {
            AnyPackageSource::Memory(s) => PckBuilder {
                inner: BuilderInner::Bytes(PackageBuilder::from_package(Arc::clone(s))),
            },
            AnyPackageSource::File(s) => PckBuilder {
                inner: BuilderInner::File(PackageBuilder::from_package(Arc::clone(s))),
            },
        }
    }
}

enum BuilderInner {
    Bytes(PackageBuilder<Vec<u8>>),
    File(PackageBuilder<MultiReader<BufferedFileReader>>),
}

/// Builder for creating or modifying pck packages.
#[wasm_bindgen]
pub struct PckBuilder {
    inner: BuilderInner,
}

#[wasm_bindgen]
impl PckBuilder {
    /// Create an empty PckBuilder (from scratch).
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: BuilderInner::Bytes(PackageBuilder::new()),
        }
    }

    /// Create a builder pre-populated with an existing package's files.
    #[wasm_bindgen(js_name = "fromPackage")]
    pub fn from_package(pkg: &PckPackage) -> Self {
        pkg.to_builder()
    }

    /// Add or overwrite a file in the builder.
    #[wasm_bindgen(js_name = "addFile")]
    pub fn add_file(&mut self, path: &str, data: &[u8]) {
        match &mut self.inner {
            BuilderInner::Bytes(b) => b.add_file(path, data.to_vec()),
            BuilderInner::File(b) => b.add_file(path, data.to_vec()),
        }
    }

    /// Remove a file from the builder. Returns true if the file was present.
    #[wasm_bindgen(js_name = "removeFile")]
    pub fn remove_file(&mut self, path: &str) -> bool {
        match &mut self.inner {
            BuilderInner::Bytes(b) => b.remove_file(path),
            BuilderInner::File(b) => b.remove_file(path),
        }
    }

    /// List all file paths that will be present in the built package.
    #[wasm_bindgen(js_name = "fileList")]
    pub fn file_list(&self) -> Vec<String> {
        match &self.inner {
            BuilderInner::Bytes(b) => b.file_list().into_iter().map(|s| s.to_string()).collect(),
            BuilderInner::File(b) => b.file_list().into_iter().map(|s| s.to_string()).collect(),
        }
    }

    /// Number of files in the builder.
    #[wasm_bindgen(getter, js_name = "fileCount")]
    pub fn file_count(&self) -> usize {
        match &self.inner {
            BuilderInner::Bytes(b) => b.file_count(),
            BuilderInner::File(b) => b.file_count(),
        }
    }

    /// Serialize the package to bytes.
    #[wasm_bindgen(js_name = "toBytes")]
    pub fn to_bytes(&self, config: Option<PackageConfig>) -> Result<Vec<u8>, JsError> {
        let config: package::PackageConfig = config.map_or_else(Default::default, |c| c.config);
        let bytes = match &self.inner {
            BuilderInner::Bytes(b) => pollster::block_on(b.to_bytes(b.default_version(), &config)),
            BuilderInner::File(b) => pollster::block_on(b.to_bytes(b.default_version(), &config)),
        }
        .map_err(|e| crate::format_error(&e))?;
        Ok(bytes)
    }
}

impl Default for PckBuilder {
    fn default() -> Self {
        Self::new()
    }
}
