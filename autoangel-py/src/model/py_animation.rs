use autoangel_core::model::stck;
use autoangel_core::util::data_source::DataSource;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Parse a STCK animation file from raw bytes.
#[pyfunction]
fn read_animation(data: &[u8]) -> PyResult<stck::Animation> {
    let source = DataSource::from_bytes(data.to_vec());
    pollster::block_on(stck::Animation::parse(&source))
        .map_err(|e| PyValueError::new_err(format!("STCK parse error: {e}")))
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<stck::Animation>()?;
    m.add_class::<stck::BoneTrack>()?;
    m.add_class::<stck::Track>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_animation, m)?)?;
    Ok(())
}
