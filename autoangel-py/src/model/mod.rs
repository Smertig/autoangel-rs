pub mod py_ecm;
pub mod py_skeleton;
pub mod py_skin;
pub mod py_smd;
pub mod py_track_set;

use pyo3::prelude::*;

pub fn fill_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    py_ecm::init_py(m)?;
    py_smd::init_py(m)?;
    py_skeleton::init_py(m)?;
    py_skin::init_py(m)?;
    py_track_set::init_py(m)?;
    Ok(())
}
