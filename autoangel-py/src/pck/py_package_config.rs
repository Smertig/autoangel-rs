use autoangel_core::pck::package::PackageConfig;
use pyo3::prelude::*;

/// Configuration for pck package.
#[pyclass(name = "PackageConfig")]
pub struct PyPackageConfig {
    pub(crate) config: PackageConfig,
}

#[pymethods]
impl PyPackageConfig {
    /// Create a new PackageConfig.
    #[new]
    #[pyo3(signature = (key1=0xA8937462, key2=0x59374231, guard1=0xFDFDFEEE, guard2=0xF00DBEEF))]
    pub fn new(key1: u32, key2: u32, guard1: u32, guard2: u32) -> Self {
        Self {
            config: PackageConfig {
                key1,
                key2,
                guard1,
                guard2,
            },
        }
    }

    /// String representation.
    fn __str__(&self) -> String {
        format!(
            "PackageConfig(key1=0x{:08X}, key2=0x{:08X}, guard1=0x{:08X}, guard2=0x{:08X})",
            self.config.key1, self.config.key2, self.config.guard1, self.config.guard2
        )
    }

    /// Detailed representation.
    fn __repr__(&self) -> String {
        format!(
            "PackageConfig(key1=0x{:08X}, key2=0x{:08X}, guard1=0x{:08X}, guard2=0x{:08X})",
            self.config.key1, self.config.key2, self.config.guard1, self.config.guard2
        )
    }

    /// First key value.
    #[getter]
    fn key1(&self) -> u32 {
        self.config.key1
    }

    #[setter]
    fn set_key1(&mut self, value: u32) {
        self.config.key1 = value;
    }

    /// Second key value.
    #[getter]
    fn key2(&self) -> u32 {
        self.config.key2
    }

    #[setter]
    fn set_key2(&mut self, value: u32) {
        self.config.key2 = value;
    }

    /// First guard value.
    #[getter]
    fn guard1(&self) -> u32 {
        self.config.guard1
    }

    #[setter]
    fn set_guard1(&mut self, value: u32) {
        self.config.guard1 = value;
    }

    /// Second guard value.
    #[getter]
    fn guard2(&self) -> u32 {
        self.config.guard2
    }

    #[setter]
    fn set_guard2(&mut self, value: u32) {
        self.config.guard2 = value;
    }
}
