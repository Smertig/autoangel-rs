use autoangel_core::model::gfx;
use pyo3::exceptions::PyIndexError;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

#[pyclass(name = "GfxEffect", frozen)]
struct PyGfxEffect {
    inner: gfx::GfxEffect,
}

#[pymethods]
impl PyGfxEffect {
    #[getter]
    fn version(&self) -> u32 {
        self.inner.version
    }

    #[getter]
    fn default_scale(&self) -> f32 {
        self.inner.default_scale
    }

    #[getter]
    fn play_speed(&self) -> f32 {
        self.inner.play_speed
    }

    #[getter]
    fn default_alpha(&self) -> f32 {
        self.inner.default_alpha
    }

    #[getter]
    fn element_count(&self) -> usize {
        self.inner.elements.len()
    }

    /// Numeric element type ID for element at index `i`.
    fn element_type(&self, i: usize) -> PyResult<i32> {
        let elem = self
            .inner
            .elements
            .get(i)
            .ok_or_else(|| PyIndexError::new_err(format!("element index {i} out of range")))?;
        Ok(elem.element_type.to_id() as i32)
    }

    /// Name of element at index `i`.
    fn element_name(&self, i: usize) -> PyResult<&str> {
        let elem = self
            .inner
            .elements
            .get(i)
            .ok_or_else(|| PyIndexError::new_err(format!("element index {i} out of range")))?;
        Ok(&elem.name)
    }

    /// Texture file path for element at index `i`.
    fn element_tex_file(&self, i: usize) -> PyResult<&str> {
        let elem = self
            .inner
            .elements
            .get(i)
            .ok_or_else(|| PyIndexError::new_err(format!("element index {i} out of range")))?;
        Ok(&elem.tex_file)
    }

    /// Element-type-specific body lines for element at index `i`, joined by newlines.
    fn element_body_text(&self, i: usize) -> PyResult<String> {
        let elem = self
            .inner
            .elements
            .get(i)
            .ok_or_else(|| PyIndexError::new_err(format!("element index {i} out of range")))?;
        Ok(elem.body_lines.join("\n"))
    }

    fn __repr__(&self) -> String {
        format!(
            "GfxEffect(version={}, element_count={})",
            self.inner.version,
            self.inner.elements.len(),
        )
    }
}

#[pyfunction]
fn read_gfx(data: &[u8]) -> PyResult<PyGfxEffect> {
    let inner = gfx::GfxEffect::parse(data).map_err(|e| PyValueError::new_err(format!("{e:#}")))?;
    Ok(PyGfxEffect { inner })
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyGfxEffect>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_gfx, m)?)?;
    Ok(())
}
