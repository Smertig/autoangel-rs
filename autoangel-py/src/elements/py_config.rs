use crate::impl_arc_list;
use autoangel_core::elements::game::GameDialectRef;
use autoangel_core::elements::{config, meta};
use pyo3::exceptions::PyIOError;
use pyo3::prelude::*;
use std::sync::Arc;

impl_arc_list!(
    PyListConfigArray,
    "ElementsListConfigArray",
    Arc<[config::ListConfig]>,
    PyListConfig
);

impl_arc_list!(
    PyMetaFieldArray,
    "ElementsMetaFieldArray",
    Arc<[meta::MetaField]>,
    PyMetaField
);

/// Configuration for elements.data.
#[pyclass(name = "ElementsConfig", from_py_object)]
#[derive(Clone)]
pub struct PyConfig {
    pub config: config::Config,
}

#[pyclass(name = "ElementsListConfig", from_py_object)]
#[derive(Clone)]
pub struct PyListConfig {
    pub list_config: config::ListConfig,
}

#[pyclass(name = "ElementsMetaField", from_py_object)]
#[derive(Clone)]
pub struct PyMetaField {
    pub name: String,
    pub r#type: String,
}

impl<'a> From<&'a config::ListConfig> for PyListConfig {
    fn from(list_config: &'a config::ListConfig) -> Self {
        PyListConfig {
            list_config: list_config.clone(),
        }
    }
}

impl<'a> From<&'a meta::MetaField> for PyMetaField {
    fn from(meta_field: &'a meta::MetaField) -> Self {
        PyMetaField {
            name: meta_field.name.clone(),
            r#type: meta_field.meta_type.repr().into_owned(),
        }
    }
}

#[pymethods]
impl PyConfig {
    /// Config name.
    #[getter]
    fn name(&self) -> Option<&str> {
        self.config.name.as_deref()
    }

    /// List configs.
    #[getter]
    fn lists(&self) -> PyListConfigArray {
        self.config.lists.clone().into()
    }
}

#[pymethods]
impl PyListConfig {
    /// List offset.
    #[getter]
    fn offset<'py>(&self, py: Python<'py>) -> Bound<'py, PyAny> {
        match self.list_config.offset {
            config::ListOffset::Auto => "AUTO".into_pyobject(py).unwrap().into_any(),
            config::ListOffset::Fixed(offset) => offset.into_pyobject(py).unwrap().into_any(),
        }
    }

    /// List caption.
    #[getter]
    fn caption(&self) -> &str {
        self.list_config.caption.as_ref()
    }

    /// List data type.
    #[getter]
    fn data_type(&self) -> i32 {
        self.list_config.dt.0
    }

    /// List space ID.
    #[getter]
    fn space_id(&self) -> &'static str {
        self.list_config.space_id.unwrap_or("unknown")
    }

    /// Array of fields.
    #[getter]
    fn fields(&self) -> PyMetaFieldArray {
        self.list_config.fields.clone().into()
    }
}

#[pymethods]
impl PyMetaField {
    /// Field name.
    #[getter]
    fn name(&self) -> &str {
        &self.name
    }

    /// Field type.
    #[getter]
    fn r#type(&self) -> &str {
        &self.r#type
    }
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    /// Parse elements config from string.
    #[pyfunction]
    fn read_elements_config_string(content: &str) -> PyResult<PyConfig> {
        Ok(PyConfig {
            config: config::Config::parse(content, None, GameDialectRef::PW)
                .map_err(|e| pyo3::exceptions::PyException::new_err(format!("parse error: {e}")))?,
        })
    }
    m.add_function(pyo3::wrap_pyfunction!(read_elements_config_string, m)?)?;

    /// Parse elements config from file.
    #[pyfunction]
    fn read_elements_config(path: &str) -> PyResult<PyConfig> {
        let file_name = std::path::Path::new(path)
            .file_name()
            .ok_or_else(|| PyIOError::new_err(format!("{path}: missing file name")))?
            .to_str()
            .ok_or_else(|| PyIOError::new_err(format!("{path}: incorrect file name")))?
            .to_owned();

        let content = std::fs::read_to_string(path)?;

        Ok(PyConfig {
            config: config::Config::parse(&content, Some(file_name), GameDialectRef::PW)
                .map_err(|e| pyo3::exceptions::PyException::new_err(format!("parse error: {e}")))?,
        })
    }
    m.add_function(pyo3::wrap_pyfunction!(read_elements_config, m)?)?;

    m.add_class::<PyConfig>()?;
    m.add_class::<PyListConfigArray>()?;
    m.add_class::<PyListConfig>()?;
    m.add_class::<PyMetaFieldArray>()?;
    m.add_class::<PyMetaField>()?;

    Ok(())
}
