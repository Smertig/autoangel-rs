use super::py_config::{PyConfig, PyListConfig};
use crate::elements::py_value::PyReadValue;
use crate::util::PySignedIndex;
use autoangel_core::elements::{config, data, meta};
use autoangel_core::util::data_source::{DataReader, DataSource};
use pyo3::exceptions::{PyException, PyKeyError, PyNotImplementedError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::PyBytes;
use std::io::BufWriter;

/// Type-erased content wrapper for elements data.
/// Holds either an in-memory or memory-mapped DataSource.
enum AnyContent {
    Bytes(DataSource<Vec<u8>>),
    Mmap(DataSource<memmap2::Mmap>),
}

impl Clone for AnyContent {
    fn clone(&self) -> Self {
        // DataSource<R> derive(Clone) requires R: Clone, but the actual fields
        // (Arc<R>, u64, u64) are always clonable. Use get(..) as a clone workaround.
        match self {
            AnyContent::Bytes(ds) => AnyContent::Bytes(ds.get(..).unwrap()),
            AnyContent::Mmap(ds) => AnyContent::Mmap(ds.get(..).unwrap()),
        }
    }
}

macro_rules! with_content {
    ($content:expr, |$c:ident| $body:expr) => {
        match $content {
            AnyContent::Bytes(ref $c) => $body,
            AnyContent::Mmap(ref $c) => $body,
        }
    };
}

fn resolve_config<R: DataReader>(
    content: &DataSource<R>,
    config: Option<PyConfig>,
) -> PyResult<config::Config> {
    match config {
        Some(c) => Ok(c.config),
        None => {
            let version = pollster::block_on(data::DataView::parse_header(content))?;
            config::Config::find_bundled(version)
                .ok_or_else(|| PyException::new_err(format!("no bundled config for v{version}")))
        }
    }
}

/// Parsed elements.data object.
#[pyclass(name = "ElementsData")]
struct PyData {
    view: data::DataView,
    content: AnyContent,
}

impl PyData {
    fn from_bytes(bytes: Vec<u8>, config: Option<PyConfig>) -> PyResult<Self> {
        let ds = DataSource::from_bytes(bytes);
        let cfg = resolve_config(&ds, config)?;
        let view = pollster::block_on(data::DataView::parse(&ds, cfg))?;
        Ok(PyData {
            view,
            content: AnyContent::Bytes(ds),
        })
    }

    fn from_file(file: std::fs::File, config: Option<PyConfig>) -> PyResult<Self> {
        let ds = DataSource::from_file(file)?;
        let cfg = resolve_config(&ds, config)?;
        let view = pollster::block_on(data::DataView::parse(&ds, cfg))?;
        Ok(PyData {
            view,
            content: AnyContent::Mmap(ds),
        })
    }
}

/// Single data list within elements.data.
#[pyclass(name = "ElementsDataList")]
struct PyDataList {
    view: data::DataListView,
    content: AnyContent,
}

/// Single data entry with dict-like field access.
#[pyclass(name = "ElementsDataEntry", from_py_object)]
#[derive(Clone)]
struct PyDataEntry {
    list_config: config::ListConfig,
    entry_view: data::DataEntryView,
    content: AnyContent,
}

impl std::fmt::Display for PyDataEntry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = with_content!(self.content, |c| {
            self.entry_view.to_string(&self.list_config, c)
        });
        f.write_str(&s)
    }
}

#[pymethods]
impl PyData {
    /// elements.data version.
    #[getter]
    fn version(&self) -> u16 {
        self.view.version
    }

    /// Save elements.data to file.
    fn save(&self, path: &str) -> PyResult<()> {
        let f = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(path)?;

        with_content!(self.content, |c| {
            pollster::block_on(self.view.write(&mut BufWriter::new(f), c))?;
        });

        Ok(())
    }

    /// Save elements.data to byte array.
    fn save_bytes<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyBytes>> {
        let mut buffer = Vec::<u8>::new();

        with_content!(self.content, |c| {
            pollster::block_on(self.view.write(&mut BufWriter::new(&mut buffer), c))?;
        });

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
        let result = with_content!(self.content, |c| {
            pollster::block_on(self.view.find_entry(id, space_id, allow_unknown, c))
        });
        Ok(result.map(|(i, entry_view)| PyDataEntry {
            list_config: self.view.lists[i].config.clone(),
            entry_view,
            content: self.content.clone(),
        }))
    }

    fn __len__(&self) -> PyResult<usize> {
        Ok(self.view.lists.len())
    }

    fn __getitem__(&self, idx: isize) -> PyResult<PyDataList> {
        Ok(PyDataList {
            view: self.view.lists.signed_index(idx)?.clone(),
            content: self.content.clone(),
        })
    }

    fn __repr__(&self) -> PyResult<String> {
        Ok(format!(
            "ElementsData(version={}, game='{}', config='{}')",
            self.view.version,
            self.view.config.game.short_name(),
            self.view.config.name.as_deref().unwrap_or("?")
        ))
    }
}

impl PyDataList {
    fn check_config_compat(&self, entry_caption: &str) -> PyResult<()> {
        if *self.view.config.caption != *entry_caption {
            return Err(PyValueError::new_err(format!(
                "list config mismatch: entry caption '{}' does not match list caption '{}'",
                entry_caption, self.view.config.caption
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
            list_config: self.view.config.clone(),
        }
    }

    /// Append entry at the end of list.
    fn append(&mut self, entry: PyDataEntry) -> PyResult<()> {
        self.check_config_compat(&entry.list_config.caption)?;

        self.view
            .push_entry(data::LazyEntry::Materialized(entry.entry_view));
        Ok(())
    }

    fn __len__(&self) -> PyResult<usize> {
        Ok(self.view.entries.read().len())
    }

    fn __getitem__(&self, idx: isize) -> PyResult<PyDataEntry> {
        let entries = self.view.entries.read();
        let index = entries.convert_signed_index(idx)?;
        let entry_view = with_content!(self.content, |c| {
            pollster::block_on(entries[index].resolve(c, &self.view.config))?.clone()
        });
        Ok(PyDataEntry {
            list_config: self.view.config.clone(),
            entry_view,
            content: self.content.clone(),
        })
    }

    fn __setitem__(&mut self, idx: isize, value: PyDataEntry) -> PyResult<()> {
        self.check_config_compat(&value.list_config.caption)?;

        let index = self.view.entries.read().convert_signed_index(idx)?;
        self.view
            .set_entry(index, data::LazyEntry::Materialized(value.entry_view));
        Ok(())
    }

    fn __delitem__(&mut self, idx: isize) -> PyResult<()> {
        let index = self.view.entries.read().convert_signed_index(idx)?;
        self.view.remove_entry(index);
        Ok(())
    }

    fn __repr__(&self) -> PyResult<String> {
        Ok(format!(
            "ElementsDataList(dt={}, caption='{}', space='{}')",
            self.view.config.dt.0,
            self.view.config.caption,
            self.view.config.space_id.unwrap_or("unknown")
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
        // deep_clone materializes all byte-range fields into owned Bytes,
        // so the cloned view is independent of the original content.
        let cloned_view = with_content!(self.content, |c| {
            let entry = data::DataEntry::from(self.entry_view.clone(), c.get(..)?);
            let cloned = pollster::block_on(entry.deep_clone())?;
            cloned.extract_view()
        });
        Ok(PyDataEntry {
            entry_view: cloned_view,
            list_config: self.list_config.clone(),
            content: self.content.clone(),
        })
    }

    fn __contains__(&self, name: &str) -> bool {
        self.find_field(name).is_ok()
    }

    fn __getattr__(&self, name: String) -> PyResult<PyReadValue> {
        let index = self.find_field(&name)?;
        let fields = self.entry_view.fields.read();
        let bytes = with_content!(self.content, |c| {
            pollster::block_on(fields[index].get_bytes(c))?
        });

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

        self.entry_view.fields.write()[index] = data::DataFieldView::Bytes(bytes);
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
