pub mod elements;
pub mod pck;
pub mod util;

use pyo3::{PyResult, prelude::*};
use pyo3_built::pyo3_built;

#[allow(dead_code)]
mod build {
    include!(concat!(env!("OUT_DIR"), "/built.rs"));
}

/// Library for working with Angelica Engine game files (elements.data, pck/pkx).
#[pymodule(gil_used = true)]
pub fn autoangel(py: Python, m: &Bound<'_, PyModule>) -> PyResult<()> {
    color_eyre::install()?;

    m.add("__build__", pyo3_built!(py, build))?;
    pck::fill_module(m)?;
    elements::fill_module(m)?;

    Ok(())
}
