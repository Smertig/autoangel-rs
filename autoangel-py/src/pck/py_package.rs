use crate::pck::py_package_config::PyPackageConfig;
use autoangel_core::pck::package;
use autoangel_core::pck::package::{
    FileEntriesOptions, FileEntriesProgressFn, FileEntryProgress, PackageConfig,
};
use autoangel_core::util::data_source::DataSource;
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

/// Object describing parsed pck package.
#[pyclass(name = "PckPackage")]
struct PyPackage {
    content: DataSource,
    info: package::PackageInfo,
}

impl PyPackage {
    fn new(content: DataSource, config: PackageConfig) -> PyResult<Self> {
        let info = package::PackageInfo::parse(&content, config)?;

        Ok(Self { content, info })
    }

    fn from_bytes(content: &[u8], config: PackageConfig) -> PyResult<Self> {
        PyPackage::new(DataSource::from_bytes(content.to_owned()), config)
    }

    fn from_file(file: std::fs::File, config: PackageConfig) -> PyResult<Self> {
        PyPackage::new(DataSource::from_file(file)?, config)
    }

    fn from_file2(
        file: std::fs::File,
        file2: std::fs::File,
        config: PackageConfig,
    ) -> PyResult<Self> {
        PyPackage::new(DataSource::from_file2(file, file2)?, config)
    }
}

#[pymethods]
impl PyPackage {
    /// Save the package to a file.
    #[pyo3(signature = (path, config=None))]
    fn save(&self, path: &str, config: Option<&PyPackageConfig>) -> PyResult<()> {
        let config = config.map_or_else(Default::default, |c| c.config.clone());
        self.info.save(&self.content, path, &config)?;
        Ok(())
    }

    /// Get file content by its path.
    fn get_file<'py>(&self, path: &str, py: Python<'py>) -> Option<Bound<'py, PyBytes>> {
        self.info
            .get_file(&self.content, path)
            .map(|r| PyBytes::new(py, &r))
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

    /// List all file entries with metadata (including content CRC32 hashes).
    /// This decompresses every file to compute hashes.
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
        let entries = self.info.file_entries(&self.content, options)?;

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
#[pyo3(signature = (content, config=None))]
fn read_pck_bytes(content: &[u8], config: Option<&PyPackageConfig>) -> PyResult<PyPackage> {
    let config = config.map_or_else(Default::default, |c| c.config.clone());
    PyPackage::from_bytes(content, config)
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(pyo3::wrap_pyfunction!(read_pck_bytes, m)?)?;

    /// Parse pck package from file using memory-mapped I/O.
    #[pyfunction]
    #[pyo3(signature = (pck_path, pkx_path=None, config=None))]
    fn read_pck(
        pck_path: &str,
        pkx_path: Option<&str>,
        config: Option<&PyPackageConfig>,
    ) -> PyResult<PyPackage> {
        let pck = std::fs::File::open(pck_path)?;
        let config = config.map_or_else(Default::default, |c| c.config.clone());

        if let Some(pkx_path) = pkx_path {
            PyPackage::from_file2(pck, std::fs::File::open(pkx_path)?, config)
        } else {
            PyPackage::from_file(pck, config)
        }
    }
    m.add_function(pyo3::wrap_pyfunction!(read_pck, m)?)?;

    m.add_class::<PyFileEntry>()?;
    m.add_class::<PyPackage>()?;
    m.add_class::<PyPackageConfig>()?;

    Ok(())
}
