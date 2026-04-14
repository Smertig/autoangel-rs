use autoangel_core::model::smd;
use autoangel_core::util::data_source::DataSource;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Parsed SMD model file.
#[pyclass(name = "SmdModel", frozen)]
struct PySmdModel {
    inner: smd::SmdModel,
}

#[pymethods]
impl PySmdModel {
    /// SMD format version.
    #[getter]
    fn version(&self) -> u32 {
        self.inner.version
    }

    /// Path to the skeleton file.
    #[getter]
    fn skeleton_path(&self) -> &str {
        &self.inner.skeleton_path
    }

    /// Skin texture paths.
    #[getter]
    fn skin_paths(&self) -> Vec<String> {
        self.inner.skin_paths.clone()
    }

    /// Directory for TCKS animation files (may be None).
    #[getter]
    fn tcks_dir(&self) -> Option<&str> {
        self.inner.tcks_dir.as_deref()
    }

    fn __repr__(&self) -> String {
        format!(
            "SmdModel(version={}, skeleton_path='{}', skin_paths={}, tcks_dir={:?})",
            self.inner.version,
            self.inner.skeleton_path,
            self.inner.skin_paths.len(),
            self.inner.tcks_dir,
        )
    }
}

/// Parse an SMD model file from raw bytes.
#[pyfunction]
fn read_smd(data: &[u8]) -> PyResult<PySmdModel> {
    let source = DataSource::from_bytes(data.to_vec());
    let model = pollster::block_on(smd::SmdModel::parse(&source))
        .map_err(|e| PyValueError::new_err(format!("SMD parse error: {e}")))?;

    Ok(PySmdModel { inner: model })
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PySmdModel>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_smd, m)?)?;
    Ok(())
}
