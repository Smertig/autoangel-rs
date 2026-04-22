use autoangel_core::model::bon;
use autoangel_core::util::data_source::DataSource;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Parse a BON skeleton file from raw bytes.
#[pyfunction]
fn read_skeleton(data: &[u8]) -> PyResult<bon::Skeleton> {
    let source = DataSource::from_bytes(data.to_vec());
    pollster::block_on(bon::Skeleton::parse(&source))
        .map_err(|e| PyValueError::new_err(format!("BON parse error: {e}")))
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<bon::Bone>()?;
    m.add_class::<bon::Hook>()?;
    m.add_class::<bon::Skeleton>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_skeleton, m)?)?;
    Ok(())
}
