use autoangel_core::util::data_source::DataSource;
use wasm_bindgen::prelude::*;

/// Parsed ECM (composite model) file.
#[wasm_bindgen]
pub struct EcmModel {
    inner: autoangel_core::model::ecm::EcmModel,
}

#[wasm_bindgen]
impl EcmModel {
    /// Parse an ECM file from bytes.
    #[wasm_bindgen]
    pub fn parse(data: &[u8]) -> Result<EcmModel, JsError> {
        let inner = autoangel_core::model::ecm::EcmModel::parse(data)
            .map_err(|e| crate::format_error(&e))?;
        Ok(EcmModel { inner })
    }

    /// Path to the skin model (.SMD).
    #[wasm_bindgen(getter, js_name = "skinModelPath")]
    pub fn skin_model_path(&self) -> String {
        self.inner.skin_model_path.clone()
    }

    /// ECM version number.
    #[wasm_bindgen(getter)]
    pub fn version(&self) -> u32 {
        self.inner.version
    }

    /// Additional skin paths referenced by this model.
    #[wasm_bindgen(getter, js_name = "additionalSkins")]
    pub fn additional_skins(&self) -> Vec<String> {
        self.inner.additional_skins.clone()
    }
}

/// Parsed SMD (skin model data) file.
#[wasm_bindgen]
pub struct SmdModel {
    inner: autoangel_core::model::smd::SmdModel,
}

#[wasm_bindgen]
impl SmdModel {
    /// Parse an SMD file from bytes.
    #[wasm_bindgen]
    pub fn parse(data: &[u8]) -> Result<SmdModel, JsError> {
        let ds = DataSource::from_bytes(data.to_vec());
        let inner = pollster::block_on(autoangel_core::model::smd::SmdModel::parse(&ds))
            .map_err(|e| crate::format_error(&e))?;
        Ok(SmdModel { inner })
    }

    /// Path to the skeleton (.bon) file.
    #[wasm_bindgen(getter, js_name = "skeletonPath")]
    pub fn skeleton_path(&self) -> String {
        self.inner.skeleton_path.clone()
    }

    /// Skin file paths referenced by this model.
    #[wasm_bindgen(getter, js_name = "skinPaths")]
    pub fn skin_paths(&self) -> Vec<String> {
        self.inner.skin_paths.clone()
    }

    /// SMD version number.
    #[wasm_bindgen(getter)]
    pub fn version(&self) -> u32 {
        self.inner.version
    }
}

/// Parsed BON (skeleton) file.
#[wasm_bindgen]
pub struct Skeleton {
    inner: autoangel_core::model::bon::Skeleton,
}

#[wasm_bindgen]
impl Skeleton {
    /// Parse a BON skeleton file from bytes.
    #[wasm_bindgen]
    pub fn parse(data: &[u8]) -> Result<Skeleton, JsError> {
        let ds = DataSource::from_bytes(data.to_vec());
        let inner = pollster::block_on(autoangel_core::model::bon::Skeleton::parse(&ds))
            .map_err(|e| crate::format_error(&e))?;
        Ok(Skeleton { inner })
    }

    /// Number of bones in the skeleton.
    #[wasm_bindgen(getter, js_name = "boneCount")]
    pub fn bone_count(&self) -> usize {
        self.inner.bones.len()
    }

    /// Get the name of bone at the given index.
    #[wasm_bindgen(js_name = "boneName")]
    pub fn bone_name(&self, index: usize) -> Option<String> {
        self.inner.bones.get(index).map(|b| b.name.clone())
    }

    /// Get the parent index of bone at the given index (-1 for root).
    #[wasm_bindgen(js_name = "boneParent")]
    pub fn bone_parent(&self, index: usize) -> i32 {
        self.inner.bones.get(index).map_or(-1, |b| b.parent)
    }

    /// Get the relative transform matrix of bone at the given index (16 floats, column-major 4x4).
    #[wasm_bindgen(js_name = "boneRelativeTransform")]
    pub fn bone_relative_transform(&self, index: usize) -> Option<Vec<f32>> {
        self.inner.bones.get(index).map(|b| b.mat_relative.to_vec())
    }

    /// Get the initial (bind-pose) transform matrix of bone at the given index (16 floats, column-major 4x4).
    #[wasm_bindgen(js_name = "boneInitTransform")]
    pub fn bone_init_transform(&self, index: usize) -> Option<Vec<f32>> {
        self.inner
            .bones
            .get(index)
            .map(|b| b.mat_bone_init.to_vec())
    }
}

/// Parsed SKI (skin) file containing meshes, textures, and materials.
#[wasm_bindgen]
pub struct WasmSkin {
    inner: autoangel_core::model::ski::Skin,
}

#[wasm_bindgen]
impl WasmSkin {
    /// Parse a SKI skin file from bytes.
    #[wasm_bindgen]
    pub fn parse(data: &[u8]) -> Result<WasmSkin, JsError> {
        let ds = DataSource::from_bytes(data.to_vec());
        let inner = pollster::block_on(autoangel_core::model::ski::Skin::parse(&ds))
            .map_err(|e| crate::format_error(&e))?;
        Ok(WasmSkin { inner })
    }

    /// Number of skin (weighted/skeletal) meshes.
    #[wasm_bindgen(getter, js_name = "skinMeshCount")]
    pub fn skin_mesh_count(&self) -> usize {
        self.inner.skin_meshes.len()
    }

    /// Number of rigid (static) meshes.
    #[wasm_bindgen(getter, js_name = "rigidMeshCount")]
    pub fn rigid_mesh_count(&self) -> usize {
        self.inner.rigid_meshes.len()
    }

    /// Texture paths used by this skin.
    #[wasm_bindgen(getter)]
    pub fn textures(&self) -> Vec<String> {
        self.inner.textures.clone()
    }

    // ---- Skin mesh accessors ----

    /// Get the name of skin mesh at the given index.
    #[wasm_bindgen(js_name = "skinMeshName")]
    pub fn skin_mesh_name(&self, index: usize) -> Option<String> {
        self.inner.skin_meshes.get(index).map(|m| m.name.clone())
    }

    /// Get the texture index of skin mesh at the given index (-1 if out of bounds).
    #[wasm_bindgen(js_name = "skinMeshTextureIndex")]
    pub fn skin_mesh_texture_index(&self, index: usize) -> i32 {
        self.inner
            .skin_meshes
            .get(index)
            .map_or(-1, |m| m.texture_index)
    }

    /// Get the material index of skin mesh at the given index (-1 if out of bounds).
    #[wasm_bindgen(js_name = "skinMeshMaterialIndex")]
    pub fn skin_mesh_material_index(&self, index: usize) -> i32 {
        self.inner
            .skin_meshes
            .get(index)
            .map_or(-1, |m| m.material_index)
    }

    /// Get flat vertex positions [x,y,z,x,y,z,...] for skin mesh at the given index.
    #[wasm_bindgen(js_name = "skinMeshPositions")]
    pub fn skin_mesh_positions(&self, index: usize) -> Option<Vec<f32>> {
        self.inner
            .skin_meshes
            .get(index)
            .map(|m| m.vertices.iter().flat_map(|v| v.position).collect())
    }

    /// Get flat vertex normals [nx,ny,nz,...] for skin mesh at the given index.
    #[wasm_bindgen(js_name = "skinMeshNormals")]
    pub fn skin_mesh_normals(&self, index: usize) -> Option<Vec<f32>> {
        self.inner
            .skin_meshes
            .get(index)
            .map(|m| m.vertices.iter().flat_map(|v| v.normal).collect())
    }

    /// Get flat UV coordinates [u,v,u,v,...] for skin mesh at the given index.
    #[wasm_bindgen(js_name = "skinMeshUvs")]
    pub fn skin_mesh_uvs(&self, index: usize) -> Option<Vec<f32>> {
        self.inner
            .skin_meshes
            .get(index)
            .map(|m| m.vertices.iter().flat_map(|v| [v.u, v.v]).collect())
    }

    /// Get triangle indices for skin mesh at the given index.
    #[wasm_bindgen(js_name = "skinMeshIndices")]
    pub fn skin_mesh_indices(&self, index: usize) -> Option<Vec<u16>> {
        self.inner.skin_meshes.get(index).map(|m| m.indices.clone())
    }

    /// Get flat bone weights [w0,w1,w2,w3,...] for skin mesh at the given index.
    /// w3 is computed as 1 - w0 - w1 - w2.
    #[wasm_bindgen(js_name = "skinMeshBoneWeights")]
    pub fn skin_mesh_bone_weights(&self, index: usize) -> Option<Vec<f32>> {
        self.inner.skin_meshes.get(index).map(|m| {
            m.vertices
                .iter()
                .flat_map(|v| {
                    let w3 = 1.0 - v.weights[0] - v.weights[1] - v.weights[2];
                    [v.weights[0], v.weights[1], v.weights[2], w3]
                })
                .collect()
        })
    }

    /// Get flat bone indices [i0,i1,i2,i3,...] for skin mesh at the given index.
    #[wasm_bindgen(js_name = "skinMeshBoneIndices")]
    pub fn skin_mesh_bone_indices(&self, index: usize) -> Option<Vec<u8>> {
        self.inner
            .skin_meshes
            .get(index)
            .map(|m| m.vertices.iter().flat_map(|v| v.bone_indices).collect())
    }

    // ---- Rigid mesh accessors ----

    /// Get the name of rigid mesh at the given index.
    #[wasm_bindgen(js_name = "rigidMeshName")]
    pub fn rigid_mesh_name(&self, index: usize) -> Option<String> {
        self.inner.rigid_meshes.get(index).map(|m| m.name.clone())
    }

    /// Get the bone index of rigid mesh at the given index (-1 if out of bounds).
    #[wasm_bindgen(js_name = "rigidMeshBoneIndex")]
    pub fn rigid_mesh_bone_index(&self, index: usize) -> i32 {
        self.inner
            .rigid_meshes
            .get(index)
            .map_or(-1, |m| m.bone_index)
    }

    /// Get the texture index of rigid mesh at the given index (-1 if out of bounds).
    #[wasm_bindgen(js_name = "rigidMeshTextureIndex")]
    pub fn rigid_mesh_texture_index(&self, index: usize) -> i32 {
        self.inner
            .rigid_meshes
            .get(index)
            .map_or(-1, |m| m.texture_index)
    }

    /// Get the material index of rigid mesh at the given index (-1 if out of bounds).
    #[wasm_bindgen(js_name = "rigidMeshMaterialIndex")]
    pub fn rigid_mesh_material_index(&self, index: usize) -> i32 {
        self.inner
            .rigid_meshes
            .get(index)
            .map_or(-1, |m| m.material_index)
    }

    /// Get flat vertex positions [x,y,z,x,y,z,...] for rigid mesh at the given index.
    #[wasm_bindgen(js_name = "rigidMeshPositions")]
    pub fn rigid_mesh_positions(&self, index: usize) -> Option<Vec<f32>> {
        self.inner
            .rigid_meshes
            .get(index)
            .map(|m| m.vertices.iter().flat_map(|v| v.position).collect())
    }

    /// Get flat vertex normals [nx,ny,nz,...] for rigid mesh at the given index.
    #[wasm_bindgen(js_name = "rigidMeshNormals")]
    pub fn rigid_mesh_normals(&self, index: usize) -> Option<Vec<f32>> {
        self.inner
            .rigid_meshes
            .get(index)
            .map(|m| m.vertices.iter().flat_map(|v| v.normal).collect())
    }

    /// Get flat UV coordinates [u,v,u,v,...] for rigid mesh at the given index.
    #[wasm_bindgen(js_name = "rigidMeshUvs")]
    pub fn rigid_mesh_uvs(&self, index: usize) -> Option<Vec<f32>> {
        self.inner
            .rigid_meshes
            .get(index)
            .map(|m| m.vertices.iter().flat_map(|v| [v.u, v.v]).collect())
    }

    /// Get triangle indices for rigid mesh at the given index.
    #[wasm_bindgen(js_name = "rigidMeshIndices")]
    pub fn rigid_mesh_indices(&self, index: usize) -> Option<Vec<u16>> {
        self.inner
            .rigid_meshes
            .get(index)
            .map(|m| m.indices.clone())
    }
}
