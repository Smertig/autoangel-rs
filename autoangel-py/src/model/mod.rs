pub mod py_animation;
pub mod py_ecm;
pub mod py_gfx;
pub mod py_skeleton;
pub mod py_skin;
pub mod py_smd;

use pyo3::prelude::*;

pub fn fill_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    py_ecm::init_py(m)?;
    py_gfx::init_py(m)?;
    py_smd::init_py(m)?;
    py_skeleton::init_py(m)?;
    py_skin::init_py(m)?;
    py_animation::init_py(m)?;
    Ok(())
}
