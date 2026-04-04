mod py_config;
mod py_data;
mod py_util;
mod py_value;

use pyo3::prelude::*;

pub fn fill_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    py_util::init_py(m)?;
    py_config::init_py(m)?;
    py_data::init_py(m)?;

    Ok(())
}
