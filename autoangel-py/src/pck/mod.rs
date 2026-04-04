mod py_package;
pub mod py_package_config;

use pyo3::prelude::*;

pub fn fill_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    py_package::init_py(m)?;

    Ok(())
}
