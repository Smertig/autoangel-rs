use autoangel_core::model::gfx;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

#[pyfunction]
fn read_gfx(data: &[u8]) -> PyResult<gfx::GfxEffect> {
    gfx::GfxEffect::parse(data).map_err(|e| PyValueError::new_err(format!("{e:#}")))
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(pyo3::wrap_pyfunction!(read_gfx, m)?)?;
    // Top-level gfx types — pyclass exposure comes from the core crate.
    m.add_class::<gfx::GfxEffect>()?;
    m.add_class::<gfx::GfxElement>()?;
    m.add_class::<gfx::ElementBody>()?;
    // Nested helper types exposed through body-variant getters.
    m.add_class::<gfx::Emitter>()?;
    m.add_class::<gfx::EmitterShape>()?;
    m.add_class::<gfx::GridVertex>()?;
    m.add_class::<gfx::GridAnimKey>()?;
    m.add_class::<gfx::NoiseCtrl>()?;
    m.add_class::<gfx::FloatValueTrans>()?;
    m.add_class::<gfx::LightningFields>()?;
    m.add_class::<gfx::SoundParamInfo>()?;
    m.add_class::<gfx::SoundAudioEvent>()?;
    Ok(())
}
