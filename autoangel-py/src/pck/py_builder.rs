use crate::pck::py_package_config::PyPackageConfig;
use autoangel_core::pck::builder::PackageBuilder;
use autoangel_core::pck::package::{PackageConfig, PackageSource};
use autoangel_core::util::data_source::MultiReader;
use pyo3::prelude::*;
use pyo3::types::*;
use std::sync::Arc;

enum AnyBuilder {
    Bytes(PackageBuilder<Vec<u8>>),
    Mmap(PackageBuilder<memmap2::Mmap>),
    MultiMmap(PackageBuilder<MultiReader<memmap2::Mmap>>),
}

macro_rules! with_builder {
    ($builder:expr, |$b:ident| $body:expr) => {
        match $builder {
            AnyBuilder::Bytes(ref mut $b) => $body,
            AnyBuilder::Mmap(ref mut $b) => $body,
            AnyBuilder::MultiMmap(ref mut $b) => $body,
        }
    };
}

macro_rules! with_builder_ref {
    ($builder:expr, |$b:ident| $body:expr) => {
        match $builder {
            AnyBuilder::Bytes(ref $b) => $body,
            AnyBuilder::Mmap(ref $b) => $body,
            AnyBuilder::MultiMmap(ref $b) => $body,
        }
    };
}

/// Builder for creating or modifying pck packages.
#[pyclass(name = "PackageBuilder")]
pub(crate) struct PyPackageBuilder {
    builder: AnyBuilder,
}

impl PyPackageBuilder {
    pub fn from_bytes_source(source: Arc<PackageSource<Vec<u8>>>) -> Self {
        Self {
            builder: AnyBuilder::Bytes(PackageBuilder::from_package(source)),
        }
    }

    pub fn from_mmap_source(source: Arc<PackageSource<memmap2::Mmap>>) -> Self {
        Self {
            builder: AnyBuilder::Mmap(PackageBuilder::from_package(source)),
        }
    }

    pub fn from_multi_mmap_source(source: Arc<PackageSource<MultiReader<memmap2::Mmap>>>) -> Self {
        Self {
            builder: AnyBuilder::MultiMmap(PackageBuilder::from_package(source)),
        }
    }
}

#[pymethods]
impl PyPackageBuilder {
    /// Create an empty PackageBuilder (from scratch).
    #[new]
    fn new() -> Self {
        Self {
            builder: AnyBuilder::Bytes(PackageBuilder::new()),
        }
    }

    /// Add or overwrite a file in the builder.
    fn add_file(&mut self, path: &str, data: &[u8]) {
        with_builder!(self.builder, |b| b.add_file(path, data.to_vec()));
    }

    /// Remove a file from the builder. Returns True if the file was present.
    fn remove_file(&mut self, path: &str) -> bool {
        with_builder!(self.builder, |b| b.remove_file(path))
    }

    /// List all file paths that will be present in the built package.
    fn file_list<'py>(&self, py: Python<'py>) -> Vec<Bound<'py, PyString>> {
        with_builder_ref!(self.builder, |b| {
            b.file_list()
                .into_iter()
                .map(|p| PyString::new(py, p))
                .collect()
        })
    }

    /// Save the package to a file.
    #[pyo3(signature = (path, *, version=None, config=None))]
    fn save(
        &self,
        path: &str,
        version: Option<u32>,
        config: Option<&PyPackageConfig>,
    ) -> PyResult<()> {
        let config: PackageConfig = config.map_or_else(Default::default, |c| c.config.clone());
        let version =
            version.unwrap_or_else(|| with_builder_ref!(self.builder, |b| b.default_version()));
        with_builder_ref!(self.builder, |b| {
            pollster::block_on(b.save(path, version, &config))?;
        });
        Ok(())
    }

    /// Serialize the package to bytes.
    #[pyo3(signature = (*, version=None, config=None))]
    fn to_bytes<'py>(
        &self,
        py: Python<'py>,
        version: Option<u32>,
        config: Option<&PyPackageConfig>,
    ) -> PyResult<Bound<'py, PyBytes>> {
        let config: PackageConfig = config.map_or_else(Default::default, |c| c.config.clone());
        let version =
            version.unwrap_or_else(|| with_builder_ref!(self.builder, |b| b.default_version()));
        let bytes = with_builder_ref!(self.builder, |b| {
            pollster::block_on(b.to_bytes(version, &config))?
        });
        Ok(PyBytes::new(py, &bytes))
    }

    fn __repr__(&self) -> String {
        let count = with_builder_ref!(self.builder, |b| b.file_count());
        format!("PackageBuilder(files={})", count)
    }
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyPackageBuilder>()?;
    Ok(())
}
