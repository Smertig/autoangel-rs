use autoangel_core::model::bon;
use autoangel_core::util::data_source::DataSource;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// A single bone from a BON skeleton file.
#[pyclass(name = "Bone", frozen)]
struct PyBone {
    inner: bon::Bone,
}

#[pymethods]
impl PyBone {
    /// Bone name.
    #[getter]
    fn name(&self) -> &str {
        &self.inner.name
    }

    /// Parent bone index (-1 if root).
    #[getter]
    fn parent(&self) -> i32 {
        self.inner.parent
    }

    /// Indices of child bones.
    #[getter]
    fn children(&self) -> Vec<i32> {
        self.inner.children.clone()
    }

    /// Relative transform matrix (column-major, 4x4 = 16 floats).
    #[getter]
    fn mat_relative(&self) -> Vec<f32> {
        self.inner.mat_relative.to_vec()
    }

    /// Initial bone-space transform matrix (column-major, 4x4 = 16 floats).
    #[getter]
    fn mat_bone_init(&self) -> Vec<f32> {
        self.inner.mat_bone_init.to_vec()
    }

    /// Whether this bone is a fake (non-rendering) bone.
    #[getter]
    fn is_fake(&self) -> bool {
        self.inner.is_fake
    }

    /// Whether this bone is flipped.
    #[getter]
    fn is_flipped(&self) -> bool {
        self.inner.is_flipped
    }

    fn __repr__(&self) -> String {
        format!(
            "Bone(name='{}', parent={})",
            self.inner.name, self.inner.parent
        )
    }
}

/// A hook attachment point from a BON skeleton file.
#[pyclass(name = "Hook", frozen)]
struct PyHook {
    inner: bon::Hook,
}

#[pymethods]
impl PyHook {
    /// Hook name.
    #[getter]
    fn name(&self) -> &str {
        &self.inner.name
    }

    /// Hook type identifier.
    #[getter]
    fn hook_type(&self) -> u32 {
        self.inner.hook_type
    }

    /// Index of the bone this hook is attached to.
    #[getter]
    fn bone_index(&self) -> i32 {
        self.inner.bone_index
    }

    /// Hook transform matrix (column-major, 4x4 = 16 floats).
    #[getter]
    fn transform(&self) -> Vec<f32> {
        self.inner.transform.to_vec()
    }

    fn __repr__(&self) -> String {
        format!(
            "Hook(name='{}', hook_type={}, bone_index={})",
            self.inner.name, self.inner.hook_type, self.inner.bone_index
        )
    }
}

/// Parsed BON skeleton file.
#[pyclass(name = "Skeleton", frozen)]
struct PySkeleton {
    inner: bon::Skeleton,
}

#[pymethods]
impl PySkeleton {
    /// BON format version.
    #[getter]
    fn version(&self) -> u32 {
        self.inner.version
    }

    /// List of bones in the skeleton.
    #[getter]
    fn bones(&self) -> Vec<PyBone> {
        self.inner
            .bones
            .iter()
            .map(|b| PyBone { inner: b.clone() })
            .collect()
    }

    /// List of hook attachment points.
    #[getter]
    fn hooks(&self) -> Vec<PyHook> {
        self.inner
            .hooks
            .iter()
            .map(|h| PyHook { inner: h.clone() })
            .collect()
    }

    fn __repr__(&self) -> String {
        format!(
            "Skeleton(version={}, bones={}, hooks={})",
            self.inner.version,
            self.inner.bones.len(),
            self.inner.hooks.len(),
        )
    }
}

/// Parse a BON skeleton file from raw bytes.
#[pyfunction]
fn read_skeleton(data: &[u8]) -> PyResult<PySkeleton> {
    let source = DataSource::from_bytes(data.to_vec());
    let skeleton = pollster::block_on(bon::Skeleton::parse(&source))
        .map_err(|e| PyValueError::new_err(format!("BON parse error: {e}")))?;

    Ok(PySkeleton { inner: skeleton })
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyBone>()?;
    m.add_class::<PyHook>()?;
    m.add_class::<PySkeleton>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_skeleton, m)?)?;
    Ok(())
}
