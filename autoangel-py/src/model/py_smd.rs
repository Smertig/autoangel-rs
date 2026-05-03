use autoangel_core::model::smd;
use autoangel_core::util::data_source::DataSource;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Parse an SMD model file from raw bytes.
#[pyfunction]
fn read_smd(data: &[u8]) -> PyResult<smd::SmdModel> {
    let source = DataSource::from_bytes(data.to_vec());
    pollster::block_on(smd::SmdModel::parse(&source))
        .map_err(|e| PyValueError::new_err(format!("SMD parse error: {e}")))
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<smd::SmdModel>()?;
    m.add_class::<smd::SmdAction>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_smd, m)?)?;
    Ok(())
}
