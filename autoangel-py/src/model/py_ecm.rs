use autoangel_core::model::ecm;
use pyo3::exceptions::PyIndexError;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

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

    /// Number of bone scale entries.
    #[getter]
    fn bone_scale_count(&self) -> usize {
        self.inner.bone_scales.len()
    }

    /// Return the bone-scale entry at `i`, or None if out of bounds.
    fn get_bone_scale(&self, i: usize) -> Option<ecm::BoneScaleEntry> {
        self.inner.bone_scales.get(i).cloned()
    }

    #[getter]
    fn scale_base_bone(&self) -> Option<&str> {
        self.inner.scale_base_bone.as_deref()
    }

    #[getter]
    fn def_play_speed(&self) -> f32 {
        self.inner.def_play_speed
    }

    /// Number of child-model attachments.
    #[getter]
    fn child_count(&self) -> usize {
        self.inner.child_models.len()
    }

    /// Return the child-model entry at `i`, or None if out of bounds.
    fn get_child(&self, i: usize) -> Option<ecm::ChildModel> {
        self.inner.child_models.get(i).cloned()
    }

    /// Number of combined actions.
    #[getter]
    fn combine_action_count(&self) -> usize {
        self.inner.combine_actions.len()
    }

    /// Name of combined action at index `i`.
    fn combine_action_name(&self, i: usize) -> PyResult<&str> {
        let action = self
            .inner
            .combine_actions
            .get(i)
            .ok_or_else(|| PyIndexError::new_err(format!("action index {i} out of range")))?;
        Ok(&action.name)
    }

    /// Loop count of combined action at index `i`.
    fn combine_action_loop_count(&self, i: usize) -> PyResult<i32> {
        let action = self
            .inner
            .combine_actions
            .get(i)
            .ok_or_else(|| PyIndexError::new_err(format!("action index {i} out of range")))?;
        Ok(action.loop_count)
    }

    /// Number of events in combined action at index `i`.
    fn combine_action_event_count(&self, i: usize) -> PyResult<usize> {
        let action = self
            .inner
            .combine_actions
            .get(i)
            .ok_or_else(|| PyIndexError::new_err(format!("action index {i} out of range")))?;
        Ok(action.events.len())
    }

    /// Return the event at (action_idx, event_idx), or None if either index is out of bounds.
    fn get_event(&self, action_idx: usize, event_idx: usize) -> Option<ecm::EcmEvent> {
        self.inner
            .combine_actions
            .get(action_idx)
            .and_then(|a| a.events.get(event_idx))
            .cloned()
    }

    /// Number of persistent CoGfx events.
    #[getter]
    fn co_gfx_count(&self) -> usize {
        self.inner.co_gfx.len()
    }

    /// FX file path of persistent CoGfx event at index `i`.
    fn co_gfx_fx_file_path(&self, i: usize) -> PyResult<&str> {
        let event = self
            .inner
            .co_gfx
            .get(i)
            .ok_or_else(|| PyIndexError::new_err(format!("co_gfx index {i} out of range")))?;
        Ok(&event.fx_file_path)
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
    m.add_class::<PyEcmModel>()?;
    m.add_class::<ecm::BoneScaleEntry>()?;
    m.add_class::<ecm::ChildModel>()?;
    m.add_class::<ecm::EcmEvent>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_ecm, m)?)?;
    Ok(())
}
