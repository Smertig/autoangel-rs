use autoangel_core::model::ecm;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

#[pyclass(name = "BoneScaleEntry", frozen)]
struct PyBoneScaleEntry {
    inner: ecm::BoneScaleEntry,
}

#[pymethods]
impl PyBoneScaleEntry {
    #[getter]
    fn bone_index(&self) -> i32 {
        self.inner.bone_index
    }

    /// Scale as (x, y, z) tuple.
    #[getter]
    fn scale(&self) -> (f32, f32, f32) {
        (
            self.inner.scale[0],
            self.inner.scale[1],
            self.inner.scale[2],
        )
    }

    /// Old format scale type; `None` for BoneScaleEx (new format).
    #[getter]
    fn scale_type(&self) -> Option<i32> {
        self.inner.scale_type
    }

    fn __repr__(&self) -> String {
        format!(
            "BoneScaleEntry(bone_index={}, scale=({}, {}, {}), scale_type={:?})",
            self.inner.bone_index,
            self.inner.scale[0],
            self.inner.scale[1],
            self.inner.scale[2],
            self.inner.scale_type
        )
    }
}

#[pyclass(name = "ChildModel", frozen)]
struct PyChildModel {
    inner: ecm::ChildModel,
}

#[pymethods]
impl PyChildModel {
    #[getter]
    fn name(&self) -> &str {
        &self.inner.name
    }

    #[getter]
    fn path(&self) -> &str {
        &self.inner.path
    }

    /// Parent hook name (HH).
    #[getter]
    fn hh_name(&self) -> &str {
        &self.inner.hh_name
    }

    /// Child connection point (CC).
    #[getter]
    fn cc_name(&self) -> &str {
        &self.inner.cc_name
    }

    fn __repr__(&self) -> String {
        format!(
            "ChildModel(name='{}', path='{}', hh_name='{}', cc_name='{}')",
            self.inner.name, self.inner.path, self.inner.hh_name, self.inner.cc_name
        )
    }
}

#[pyclass(name = "EcmModel", frozen)]
struct PyEcmModel {
    inner: ecm::EcmModel,
}

#[pymethods]
impl PyEcmModel {
    #[getter]
    fn version(&self) -> u32 {
        self.inner.version
    }

    /// Path to the skin model (SMD) file.
    #[getter]
    fn skin_model_path(&self) -> &str {
        &self.inner.skin_model_path
    }

    #[getter]
    fn additional_skins(&self) -> Vec<String> {
        self.inner.additional_skins.clone()
    }

    /// Original color as ARGB hex value.
    #[getter]
    fn org_color(&self) -> u32 {
        self.inner.org_color
    }

    #[getter]
    fn src_blend(&self) -> i32 {
        self.inner.src_blend
    }

    #[getter]
    fn dest_blend(&self) -> i32 {
        self.inner.dest_blend
    }

    #[getter]
    fn outer_floats(&self) -> Vec<f32> {
        self.inner.outer_floats.clone()
    }

    /// Whether BoneScaleEx (new) format is used for bone scaling.
    #[getter]
    fn new_bone_scale(&self) -> bool {
        self.inner.new_bone_scale
    }

    #[getter]
    fn bone_scales(&self) -> Vec<PyBoneScaleEntry> {
        self.inner
            .bone_scales
            .iter()
            .map(|e| PyBoneScaleEntry { inner: e.clone() })
            .collect()
    }

    #[getter]
    fn scale_base_bone(&self) -> Option<&str> {
        self.inner.scale_base_bone.as_deref()
    }

    #[getter]
    fn def_play_speed(&self) -> f32 {
        self.inner.def_play_speed
    }

    #[getter]
    fn child_models(&self) -> Vec<PyChildModel> {
        self.inner
            .child_models
            .iter()
            .map(|c| PyChildModel { inner: c.clone() })
            .collect()
    }

    fn __repr__(&self) -> String {
        format!(
            "EcmModel(version={}, skin_model_path='{}', additional_skins={}, bone_scales={}, child_models={})",
            self.inner.version,
            self.inner.skin_model_path,
            self.inner.additional_skins.len(),
            self.inner.bone_scales.len(),
            self.inner.child_models.len(),
        )
    }
}

#[pyfunction]
fn read_ecm(data: &[u8]) -> PyResult<PyEcmModel> {
    let inner = ecm::EcmModel::parse(data).map_err(|e| PyValueError::new_err(format!("{e:#}")))?;
    Ok(PyEcmModel { inner })
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyBoneScaleEntry>()?;
    m.add_class::<PyChildModel>()?;
    m.add_class::<PyEcmModel>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_ecm, m)?)?;
    Ok(())
}
