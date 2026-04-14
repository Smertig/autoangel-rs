use autoangel_core::model::stck;
use autoangel_core::util::data_source::DataSource;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// A single animation track (position or rotation keyframes).
#[pyclass(name = "Track", frozen)]
struct PyTrack {
    inner: stck::Track,
}

#[pymethods]
impl PyTrack {
    /// Frame rate of this track.
    #[getter]
    fn frame_rate(&self) -> i32 {
        self.inner.frame_rate
    }

    /// Track length in milliseconds.
    #[getter]
    fn track_length_ms(&self) -> i32 {
        self.inner.track_length_ms
    }

    /// Flat keyframe data: 3 floats per key (position) or 4 floats per key (rotation).
    #[getter]
    fn keys(&self) -> Vec<f32> {
        self.inner.keys.clone()
    }

    /// Per-key frame IDs; `None` for V1 files.
    #[getter]
    fn key_frame_ids(&self) -> Option<Vec<u16>> {
        self.inner.key_frame_ids.clone()
    }

    fn __repr__(&self) -> String {
        format!(
            "Track(frame_rate={}, track_length_ms={}, keys={})",
            self.inner.frame_rate,
            self.inner.track_length_ms,
            self.inner.keys.len(),
        )
    }
}

/// Per-bone animation track data.
#[pyclass(name = "BoneTrack", frozen)]
struct PyBoneTrack {
    inner: stck::BoneTrack,
}

#[pymethods]
impl PyBoneTrack {
    /// Bone identifier.
    #[getter]
    fn bone_id(&self) -> i32 {
        self.inner.bone_id
    }

    /// Position track for this bone.
    #[getter]
    fn position(&self) -> PyTrack {
        PyTrack {
            inner: self.inner.position.clone(),
        }
    }

    /// Rotation track for this bone.
    #[getter]
    fn rotation(&self) -> PyTrack {
        PyTrack {
            inner: self.inner.rotation.clone(),
        }
    }

    fn __repr__(&self) -> String {
        format!("BoneTrack(bone_id={})", self.inner.bone_id)
    }
}

/// Parsed STCK track set file.
#[pyclass(name = "TrackSet", frozen)]
struct PyTrackSet {
    inner: stck::TrackSet,
}

#[pymethods]
impl PyTrackSet {
    /// STCK format version.
    #[getter]
    fn version(&self) -> u32 {
        self.inner.version
    }

    /// Animation start frame.
    #[getter]
    fn anim_start(&self) -> i32 {
        self.inner.anim_start
    }

    /// Animation end frame.
    #[getter]
    fn anim_end(&self) -> i32 {
        self.inner.anim_end
    }

    /// Animation frames per second.
    #[getter]
    fn anim_fps(&self) -> i32 {
        self.inner.anim_fps
    }

    /// Per-bone animation tracks.
    #[getter]
    fn bone_tracks(&self) -> Vec<PyBoneTrack> {
        self.inner
            .bone_tracks
            .iter()
            .map(|bt| PyBoneTrack { inner: bt.clone() })
            .collect()
    }

    fn __repr__(&self) -> String {
        format!(
            "TrackSet(version={}, anim_start={}, anim_end={}, anim_fps={}, bone_tracks={})",
            self.inner.version,
            self.inner.anim_start,
            self.inner.anim_end,
            self.inner.anim_fps,
            self.inner.bone_tracks.len(),
        )
    }
}

/// Parse a STCK track set file from raw bytes.
#[pyfunction]
fn read_track_set(data: &[u8]) -> PyResult<PyTrackSet> {
    let source = DataSource::from_bytes(data.to_vec());
    let track_set = pollster::block_on(stck::TrackSet::parse(&source))
        .map_err(|e| PyValueError::new_err(format!("STCK parse error: {e}")))?;

    Ok(PyTrackSet { inner: track_set })
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyTrack>()?;
    m.add_class::<PyBoneTrack>()?;
    m.add_class::<PyTrackSet>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_track_set, m)?)?;
    Ok(())
}
