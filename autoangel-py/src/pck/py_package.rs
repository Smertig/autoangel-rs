use crate::pck::py_package_config::PyPackageConfig;
use autoangel_core::pck::package;
use autoangel_core::pck::package::{
    FileEntriesOptions, FileEntriesProgressFn, FileEntryProgress, PackageConfig, ParseOptions,
    ParseProgress, ParseProgressFn,
};
use autoangel_core::util::data_source::{DataSource, MultiReader};
use color_eyre::eyre;
use pyo3::prelude::*;
use pyo3::types::*;

/// Metadata for a single file entry in a pck package.
#[pyclass(name = "FileEntry")]
struct PyFileEntry {
    #[pyo3(get)]
    path: String,
    #[pyo3(get)]
    size: u32,
    #[pyo3(get)]
    compressed_size: u32,
    #[pyo3(get)]
    hash: u32,
}

#[pymethods]
impl PyFileEntry {
    fn __repr__(&self) -> String {
        format!(
            "FileEntry(path='{}', size={}, compressed_size={}, hash=0x{:08X})",
            self.path, self.size, self.compressed_size, self.hash
        )
    }
}

enum AnyPckContent {
    Bytes(DataSource<Vec<u8>>),
    Mmap(DataSource<memmap2::Mmap>),
    MultiMmap(DataSource<MultiReader<memmap2::Mmap>>),
}

macro_rules! with_pck_content {
    ($content:expr, |$c:ident| $body:expr) => {
        match $content {
            AnyPckContent::Bytes(ref $c) => $body,
            AnyPckContent::Mmap(ref $c) => $body,
            AnyPckContent::MultiMmap(ref $c) => $body,
        }
    };
}

/// Object describing parsed pck package.
#[pyclass(name = "PckPackage")]
struct PyPackage {
    content: AnyPckContent,
    info: package::PackageInfo,
}

impl PyPackage {
    fn from_bytes(content: &[u8], config: PackageConfig, options: ParseOptions) -> PyResult<Self> {
        let ds = DataSource::from_bytes(content.to_owned());
        let info = pollster::block_on(package::PackageInfo::parse(&ds, config, options))?;
        Ok(Self {
            content: AnyPckContent::Bytes(ds),
            info,
        })
    }

    fn from_file(
        file: std::fs::File,
        config: PackageConfig,
        options: ParseOptions,
    ) -> PyResult<Self> {
        let ds = DataSource::from_file(file)?;
        let info = pollster::block_on(package::PackageInfo::parse(&ds, config, options))?;
        Ok(Self {
            content: AnyPckContent::Mmap(ds),
            info,
        })
    }

    fn from_files(
        files: Vec<std::fs::File>,
        config: PackageConfig,
        options: ParseOptions,
    ) -> PyResult<Self> {
        let ds = DataSource::from_files(files)?;
        let info = pollster::block_on(package::PackageInfo::parse(&ds, config, options))?;
        Ok(Self {
            content: AnyPckContent::MultiMmap(ds),
            info,
        })
    }
}

#[pymethods]
impl PyPackage {
    /// Save the package to a file.
    #[pyo3(signature = (path, config=None))]
    fn save(&self, path: &str, config: Option<&PyPackageConfig>) -> PyResult<()> {
        let config = config.map_or_else(Default::default, |c| c.config.clone());
        with_pck_content!(self.content, |c| {
            pollster::block_on(self.info.save(c, path, &config))?;
        });
        Ok(())
    }

    /// Get file content by its path.
    fn get_file<'py>(&self, path: &str, py: Python<'py>) -> Option<Bound<'py, PyBytes>> {
        with_pck_content!(self.content, |c| {
            pollster::block_on(self.info.get_file(c, path)).map(|r| PyBytes::new(py, &r))
        })
    }

    /// Find files by path prefix.
    fn find_prefix<'py>(&self, prefix: &str, py: Python<'py>) -> Vec<Bound<'py, PyString>> {
        self.info
            .find_prefix(prefix)
            .iter()
            .map(|e| PyString::new(py, &e.normalized_name))
            .collect()
    }

    /// List all file paths in package.
    fn file_list<'py>(&self, py: Python<'py>) -> Vec<Bound<'py, PyString>> {
        self.find_prefix("", py)
    }

    /// List all file entries with metadata (including compressed data CRC32 hashes).
    /// Hashes are computed from compressed (on-disk) data without decompression.
    #[pyo3(signature = (*, on_progress=None))]
    fn file_entries(&self, on_progress: Option<Py<PyAny>>) -> PyResult<Vec<PyFileEntry>> {
        let options = FileEntriesOptions {
            on_progress: on_progress.map(|cb| -> FileEntriesProgressFn {
                Box::new(move |p: FileEntryProgress| {
                    Python::attach(|py| {
                        cb.call1(py, (p.path, p.index, p.total))
                            .map_err(eyre::Report::from)
                    })?;
                    Ok(())
                })
            }),
        };
        let entries = with_pck_content!(self.content, |c| {
            pollster::block_on(self.info.file_entries(c, options))?
        });

        Ok(entries
            .into_iter()
            .map(|e| PyFileEntry {
                path: e.path.to_owned(),
                size: e.size,
                compressed_size: e.compressed_size,
                hash: e.hash,
            })
            .collect())
    }

    fn __repr__(&self) -> String {
        format!(
            "PckPackage(version=0x{:X}, files={})",
            self.info.version(),
            self.info.file_count()
        )
    }
}

/// Parse package from byte array.
#[pyfunction]
#[pyo3(signature = (content, config=None, *, on_progress=None, progress_interval_ms=0))]
fn read_pck_bytes(
    content: &[u8],
    config: Option<&PyPackageConfig>,
    on_progress: Option<Py<PyAny>>,
    progress_interval_ms: u32,
) -> PyResult<PyPackage> {
    let config = config.map_or_else(Default::default, |c| c.config.clone());
    let options = make_parse_options(on_progress, progress_interval_ms);
    PyPackage::from_bytes(content, config, options)
}

fn make_parse_options(on_progress: Option<Py<PyAny>>, progress_interval_ms: u32) -> ParseOptions {
    ParseOptions {
        on_progress: on_progress.map(|cb| -> ParseProgressFn {
            Box::new(move |p: ParseProgress| {
                Python::attach(|py| cb.call1(py, (p.index, p.total)).map_err(eyre::Report::from))?;
                Ok(())
            })
        }),
        progress_interval_ms,
    }
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(pyo3::wrap_pyfunction!(read_pck_bytes, m)?)?;

    /// Parse pck package from file(s) using memory-mapped I/O.
    #[pyfunction]
    #[pyo3(signature = (pck_path, pkx_paths=None, *, config=None, on_progress=None, progress_interval_ms=0))]
    fn read_pck(
        pck_path: &str,
        pkx_paths: Option<&Bound<'_, PyAny>>,
        config: Option<&PyPackageConfig>,
        on_progress: Option<Py<PyAny>>,
        progress_interval_ms: u32,
    ) -> PyResult<PyPackage> {
        let pck = std::fs::File::open(pck_path)?;
        let config = config.map_or_else(Default::default, |c| c.config.clone());
        let options = make_parse_options(on_progress, progress_interval_ms);

        let mut files = vec![pck];

        if let Some(paths) = pkx_paths {
            if let Ok(s) = paths.extract::<String>() {
                files.push(std::fs::File::open(s)?);
            } else {
                let list = paths.extract::<Vec<String>>()?;
                for p in list {
                    files.push(std::fs::File::open(p)?);
                }
            }
        }

        if files.len() == 1 {
            PyPackage::from_file(files.into_iter().next().unwrap(), config, options)
        } else {
            PyPackage::from_files(files, config, options)
        }
    }
    m.add_function(pyo3::wrap_pyfunction!(read_pck, m)?)?;

    m.add_class::<PyFileEntry>()?;
    m.add_class::<PyPackage>()?;
    m.add_class::<PyPackageConfig>()?;

    Ok(())
}
