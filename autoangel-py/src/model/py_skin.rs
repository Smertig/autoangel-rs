use autoangel_core::model::ski;
use autoangel_core::util::data_source::DataSource;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// A material from a SKI skin file.
#[pyclass(name = "Material", frozen)]
struct PyMaterial {
    inner: ski::Material,
}

#[pymethods]
impl PyMaterial {
    /// Material name.
    #[getter]
    fn name(&self) -> &str {
        &self.inner.name
    }

    /// Ambient color as (r, g, b, a) tuple.
    #[getter]
    fn ambient(&self) -> (f32, f32, f32, f32) {
        let c = self.inner.ambient;
        (c[0], c[1], c[2], c[3])
    }

    /// Diffuse color as (r, g, b, a) tuple.
    #[getter]
    fn diffuse(&self) -> (f32, f32, f32, f32) {
        let c = self.inner.diffuse;
        (c[0], c[1], c[2], c[3])
    }

    /// Emissive color as (r, g, b, a) tuple.
    #[getter]
    fn emissive(&self) -> (f32, f32, f32, f32) {
        let c = self.inner.emissive;
        (c[0], c[1], c[2], c[3])
    }

    /// Specular color as (r, g, b, a) tuple.
    #[getter]
    fn specular(&self) -> (f32, f32, f32, f32) {
        let c = self.inner.specular;
        (c[0], c[1], c[2], c[3])
    }

    /// Specular power.
    #[getter]
    fn power(&self) -> f32 {
        self.inner.power
    }

    /// Whether the material is two-sided.
    #[getter]
    fn two_sided(&self) -> bool {
        self.inner.two_sided
    }

    fn __repr__(&self) -> String {
        format!("Material(name='{}')", self.inner.name)
    }
}

/// A skinned mesh from a SKI skin file.
#[pyclass(name = "SkinMesh", frozen)]
struct PySkinMesh {
    inner: ski::SkinMesh,
}

#[pymethods]
impl PySkinMesh {
    /// Mesh name.
    #[getter]
    fn name(&self) -> &str {
        &self.inner.name
    }

    /// Index of the texture used by this mesh (-1 = none).
    #[getter]
    fn texture_index(&self) -> i32 {
        self.inner.texture_index
    }

    /// Index of the material used by this mesh (-1 = none).
    #[getter]
    fn material_index(&self) -> i32 {
        self.inner.material_index
    }

    /// Flat array of vertex positions [x0, y0, z0, x1, y1, z1, ...].
    #[getter]
    fn positions(&self) -> Vec<f32> {
        self.inner
            .vertices
            .iter()
            .flat_map(|v| v.position)
            .collect()
    }

    /// Flat array of vertex normals [x0, y0, z0, x1, y1, z1, ...].
    #[getter]
    fn normals(&self) -> Vec<f32> {
        self.inner.vertices.iter().flat_map(|v| v.normal).collect()
    }

    /// Flat array of UV coordinates [u0, v0, u1, v1, ...].
    #[getter]
    fn uvs(&self) -> Vec<f32> {
        self.inner
            .vertices
            .iter()
            .flat_map(|v| [v.u, v.v])
            .collect()
    }

    /// Triangle indices.
    #[getter]
    fn indices(&self) -> Vec<u16> {
        self.inner.indices.clone()
    }

    /// Flat array of bone weights [w0, w1, w2, w3, ...] per vertex (4 weights each, w3 derived).
    #[getter]
    fn bone_weights(&self) -> Vec<f32> {
        self.inner
            .vertices
            .iter()
            .flat_map(|v| {
                let w3 = (1.0 - v.weights[0] - v.weights[1] - v.weights[2]).max(0.0);
                [v.weights[0], v.weights[1], v.weights[2], w3]
            })
            .collect()
    }

    /// Flat array of bone indices [b0, b1, b2, b3, ...] per vertex (4 indices each).
    #[getter]
    fn bone_indices(&self) -> Vec<u8> {
        self.inner
            .vertices
            .iter()
            .flat_map(|v| v.bone_indices)
            .collect()
    }

    fn __repr__(&self) -> String {
        format!(
            "SkinMesh(name='{}', vertices={}, indices={})",
            self.inner.name,
            self.inner.vertices.len(),
            self.inner.indices.len(),
        )
    }
}

/// A rigid (non-skinned) mesh from a SKI skin file.
#[pyclass(name = "RigidMesh", frozen)]
struct PyRigidMesh {
    inner: ski::RigidMesh,
}

#[pymethods]
impl PyRigidMesh {
    /// Mesh name.
    #[getter]
    fn name(&self) -> &str {
        &self.inner.name
    }

    /// Index of the bone this mesh is attached to.
    #[getter]
    fn bone_index(&self) -> i32 {
        self.inner.bone_index
    }

    /// Index of the texture used by this mesh (-1 = none).
    #[getter]
    fn texture_index(&self) -> i32 {
        self.inner.texture_index
    }

    /// Index of the material used by this mesh (-1 = none).
    #[getter]
    fn material_index(&self) -> i32 {
        self.inner.material_index
    }

    /// Flat array of vertex positions [x0, y0, z0, x1, y1, z1, ...].
    #[getter]
    fn positions(&self) -> Vec<f32> {
        self.inner
            .vertices
            .iter()
            .flat_map(|v| v.position)
            .collect()
    }

    /// Flat array of vertex normals [x0, y0, z0, x1, y1, z1, ...].
    #[getter]
    fn normals(&self) -> Vec<f32> {
        self.inner.vertices.iter().flat_map(|v| v.normal).collect()
    }

    /// Flat array of UV coordinates [u0, v0, u1, v1, ...].
    #[getter]
    fn uvs(&self) -> Vec<f32> {
        self.inner
            .vertices
            .iter()
            .flat_map(|v| [v.u, v.v])
            .collect()
    }

    /// Triangle indices.
    #[getter]
    fn indices(&self) -> Vec<u16> {
        self.inner.indices.clone()
    }

    fn __repr__(&self) -> String {
        format!(
            "RigidMesh(name='{}', vertices={}, indices={})",
            self.inner.name,
            self.inner.vertices.len(),
            self.inner.indices.len(),
        )
    }
}

/// Parsed SKI skin file.
#[pyclass(name = "Skin", frozen)]
struct PySkin {
    inner: ski::Skin,
}

#[pymethods]
impl PySkin {
    /// SKI format version.
    #[getter]
    fn version(&self) -> u32 {
        self.inner.version
    }

    /// Texture file paths referenced by this skin.
    #[getter]
    fn textures(&self) -> Vec<String> {
        self.inner.textures.clone()
    }

    /// Materials defined in this skin.
    #[getter]
    fn materials(&self) -> Vec<PyMaterial> {
        self.inner
            .materials
            .iter()
            .map(|m| PyMaterial { inner: m.clone() })
            .collect()
    }

    /// Skinned (weighted) meshes.
    #[getter]
    fn skin_meshes(&self) -> Vec<PySkinMesh> {
        self.inner
            .skin_meshes
            .iter()
            .map(|m| PySkinMesh { inner: m.clone() })
            .collect()
    }

    /// Rigid (bone-attached) meshes.
    #[getter]
    fn rigid_meshes(&self) -> Vec<PyRigidMesh> {
        self.inner
            .rigid_meshes
            .iter()
            .map(|m| PyRigidMesh { inner: m.clone() })
            .collect()
    }

    /// Bone names referenced by this skin.
    #[getter]
    fn bone_names(&self) -> Vec<String> {
        self.inner.bone_names.clone()
    }

    /// Total skeleton bone count from the header (identity remap range for SKI version < 9).
    #[getter]
    fn num_ske_bone(&self) -> u32 {
        self.inner.num_ske_bone
    }

    fn __repr__(&self) -> String {
        format!(
            "Skin(version={}, textures={}, materials={}, skin_meshes={}, rigid_meshes={}, bone_names={})",
            self.inner.version,
            self.inner.textures.len(),
            self.inner.materials.len(),
            self.inner.skin_meshes.len(),
            self.inner.rigid_meshes.len(),
            self.inner.bone_names.len(),
        )
    }
}

/// Parse a SKI skin file from raw bytes.
#[pyfunction]
fn read_skin(data: &[u8]) -> PyResult<PySkin> {
    let source = DataSource::from_bytes(data.to_vec());
    let skin = pollster::block_on(ski::Skin::parse(&source))
        .map_err(|e| PyValueError::new_err(format!("SKI parse error: {e}")))?;

    Ok(PySkin { inner: skin })
}

pub fn init_py(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyMaterial>()?;
    m.add_class::<PySkinMesh>()?;
    m.add_class::<PyRigidMesh>()?;
    m.add_class::<PySkin>()?;
    m.add_function(pyo3::wrap_pyfunction!(read_skin, m)?)?;
    Ok(())
}
