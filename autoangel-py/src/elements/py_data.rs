use super::py_config::{PyConfig, PyListConfig};
use crate::elements::py_value::PyReadValue;
use crate::util::PySignedIndex;
use autoangel_core::elements::{config, data, meta};
use autoangel_core::util::data_source::DataSource;
use pyo3::exceptions::{PyException, PyKeyError, PyNotImplementedError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::PyBytes;
use std::fmt::Formatter;
use std::io::BufWriter;

/// Parsed elements.data object.
#[pyclass(name = "ElementsData")]
struct PyData(data::Data);

/// Single data list within elements.data.
#[pyclass(name = "ElementsDataList")]
struct PyDataList(data::DataList);

/// Single data entry with dict-like field access.
#[pyclass(name = "ElementsDataEntry", from_py_object)]
#[derive(Clone)]
struct PyDataEntry {
    list_config: config::ListConfig,
    inner: data::DataEntry,
}

impl std::fmt::Display for PyDataEntry {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        self.inner.fmt(&self.list_config, &self.inner.content, f)
    }
}

impl PyData {
    fn from_content(content: DataSource, config: Option<PyConfig>) -> PyResult<Self> {
        let config = match config {
            Some(value) => value.config,
            None => {
                let version = data::DataView::parse_header(&content)?;
                config::Config::find_bundled(version).ok_or_else(|| {
                    PyException::new_err(format!("no bundled config for v{version}"))
                })?
            }
        };

        let parsed_data = data::DataView::parse(&content, config)?;

        Ok(PyData(data::Data::from(parsed_data, content)))
    }

    fn from_bytes(bytes: Vec<u8>, config: Option<PyConfig>) -> PyResult<Self> {
        Self::from_content(DataSource::from_bytes(bytes), config)
    }

    fn from_file(file: std::fs::File, config: Option<PyConfig>) -> PyResult<Self> {
        Self::from_content(DataSource::from_file(file)?, config)
    }
}

#[pymethods]
impl PyData {
    /// elements.data version.
    #[getter]
    fn version(&self) -> u16 {
        self.0.version
    }

    /// Save elements.data to file.
    fn save(&self, path: &str) -> PyResult<()> {
        let f = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(path)?;

        self.0.write(&mut BufWriter::new(f))?;

        Ok(())
    }

    /// Save elements.data to byte array.
    fn save_bytes<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyBytes>> {
        let mut buffer = Vec::<u8>::new();

        self.0.write(&mut BufWriter::new(&mut buffer))?;

        Ok(PyBytes::new(py, &buffer))
    }

    /// Find entry by ID and space ID.
    #[pyo3(signature = (id, space_id=None, allow_unknown=true))]
    fn find_entry(
        &self,
        id: u32,
        space_id: Option<&str>,
        allow_unknown: bool,
    ) -> PyResult<Option<PyDataEntry>> {
        Ok(self
            .0
            .find_entry(id, space_id, allow_unknown)
            .map(|(i, entry)| PyDataEntry {
                list_config: self.0.lists[i].config.clone(),
                inner: entry,
            }))
    }

    fn __len__(&self) -> PyResult<usize> {
        Ok(self.0.lists.len())
    }

    fn __getitem__(&self, idx: isize) -> PyResult<PyDataList> {
        Ok(PyDataList(data::DataList::from(
            self.0.lists.signed_index(idx)?.clone(),
            self.0.content.clone(),
        )))
    }

    fn __repr__(&self) -> PyResult<String> {
        Ok(format!(
            "ElementsData(version={}, game='{}', config='{}')",
            self.0.version,
            self.0.config.game.short_name(),
            self.0.config.name.as_deref().unwrap_or("?")
        ))
    }
}

impl PyDataList {
    fn check_config_compat(&self, entry_caption: &str) -> PyResult<()> {
        if *self.0.config.caption != *entry_caption {
            return Err(PyValueError::new_err(format!(
                "list config mismatch: entry caption '{}' does not match list caption '{}'",
                entry_caption, self.0.config.caption
            )));
        }
        Ok(())
    }
}

#[pymethods]
impl PyDataList {
    /// List config.
    #[getter]
    fn config(&self) -> PyListConfig {
        PyListConfig {
            list_config: self.0.config.clone(),
        }
    }

    /// Append entry at the end of list.
    fn append(&mut self, entry: PyDataEntry) -> PyResult<()> {
        self.check_config_compat(&entry.list_config.caption)?;

        self.0
            .push_entry(data::LazyEntry::Materialized(entry.inner.extract_view()));
        Ok(())
    }

    fn __len__(&self) -> PyResult<usize> {
        Ok(self.0.entries.read().len())
    }

    fn __getitem__(&self, idx: isize) -> PyResult<PyDataEntry> {
        let entries = self.0.entries.read();
        let index = entries.convert_signed_index(idx)?;
        let entry_view = entries[index]
            .resolve(&self.0.content, &self.0.config)?
            .clone();
        Ok(PyDataEntry {
            list_config: self.0.config.clone(),
            inner: data::DataEntry::from(entry_view, self.0.content.clone()),
        })
    }

    fn __setitem__(&mut self, idx: isize, value: PyDataEntry) -> PyResult<()> {
        self.check_config_compat(&value.list_config.caption)?;

        let index = self.0.entries.read().convert_signed_index(idx)?;
        self.0.set_entry(
            index,
            data::LazyEntry::Materialized(value.inner.extract_view()),
        );
        Ok(())
    }

    fn __delitem__(&mut self, idx: isize) -> PyResult<()> {
        let index = self.0.entries.read().convert_signed_index(idx)?;
        self.0.remove_entry(index);
        Ok(())
    }

    fn __repr__(&self) -> PyResult<String> {
        Ok(format!(
            "ElementsDataList(dt={}, caption='{}', space='{}')",
            self.0.config.dt.0,
            self.0.config.caption,
            self.0.config.space_id.unwrap_or("unknown")
        ))
    }
}

impl PyDataEntry {
    fn find_field(&self, name: &str) -> PyResult<usize> {
        self.list_config
            .find_field(name)
            .ok_or_else(|| PyKeyError::new_err(format!("missing field '{name}'")))
    }
}

#[pymethods]
impl PyDataEntry {
    /// Get entry field names.
    fn keys(&self) -> Vec<String> {
        self.list_config
            .fields
            .iter()
            .map(|field| field.name.clone())
            .collect()
    }

    /// Get deep copy of this entry.
    fn copy(&self) -> PyResult<Self> {
        Ok(PyDataEntry {
            inner: self.inner.deep_clone()?,
            list_config: self.list_config.clone(),
        })
    }

    fn __contains__(&self, name: &str) -> bool {
        self.find_field(name).is_ok()
    }

    fn __getattr__(&self, name: String) -> PyResult<PyReadValue> {
        let index = self.find_field(&name)?;
        let fields = self.inner.fields.read();
        let bytes = fields[index].get_bytes(&self.inner.content)?;

        Ok(PyReadValue(
            self.list_config.fields[index]
                .meta_type
                .read_value(&bytes)?,
        ))
    }

    fn __setattr__(&mut self, name: String, value: Bound<'_, PyAny>) -> PyResult<()> {
        use meta::MetaType;

        let index = self.find_field(&name)?;

        let bytes = match &self.list_config.fields[index].meta_type {
            MetaType::I32(meta) => meta.value_to_bytes(value.extract()?),
            MetaType::I64(meta) => meta.value_to_bytes(value.extract()?),
            MetaType::F32(meta) => meta.value_to_bytes(value.extract()?),
            MetaType::F64(meta) => meta.value_to_bytes(value.extract()?),
            MetaType::ByteAuto(_meta) => {
                return Err(PyNotImplementedError::new_err(
                    "setting ByteAuto fields is not yet supported",
                ));
            }
            MetaType::Bytes(_meta) => {
                return Err(PyNotImplementedError::new_err(
                    "setting Bytes fields is not yet supported",
                ));
            }
            MetaType::GBKString(meta) => meta.value_to_bytes(value.extract()?)?,
            MetaType::UTF16String(meta) => meta.value_to_bytes(value.extract()?)?,
        };

        self.inner.fields.write()[index] = data::DataFieldView::Bytes(bytes);
        Ok(())
    }

    fn __str__(&self) -> String {
        format!("{self}")
    }

    fn __repr__(&self) -> String {
        self.__str__()
    }

    fn __len__(&self) -> usize {
        self.list_config.fields.len()
    }

    fn __getitem__(&self, key: String) -> PyResult<PyReadValue> {
        self.__getattr__(key)
    }

    fn __setitem__(&mut self, key: String, value: Bound<'_, PyAny>) -> PyResult<()> {
        self.__setattr__(key, value)
    }
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    /// Parse elements.data from byte array.
    #[pyfunction]
    #[pyo3(signature = (content, config=None))]
    fn read_elements_bytes(content: Vec<u8>, config: Option<PyConfig>) -> PyResult<PyData> {
        PyData::from_bytes(content, config)
    }
    m.add_function(pyo3::wrap_pyfunction!(read_elements_bytes, m)?)?;

    /// Parse elements.data from file using memory-mapped I/O.
    #[pyfunction]
    #[pyo3(signature = (elements_path, config=None))]
    fn read_elements(elements_path: &str, config: Option<PyConfig>) -> PyResult<PyData> {
        let elements = std::fs::File::open(elements_path)?;

        PyData::from_file(elements, config)
    }
    m.add_function(pyo3::wrap_pyfunction!(read_elements, m)?)?;

    m.add_class::<PyConfig>()?;
    m.add_class::<PyData>()?;
    m.add_class::<PyDataList>()?;
    m.add_class::<PyDataEntry>()?;

    Ok(())
}
