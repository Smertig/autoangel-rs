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

    /// Whether BoneScaleEx (new) format is used for bone scaling.
    #[wasm_bindgen(getter, js_name = "newBoneScale")]
    pub fn new_bone_scale(&self) -> bool {
        self.inner.new_bone_scale
    }

    /// Number of bone scale entries.
    #[wasm_bindgen(getter, js_name = "boneScaleCount")]
    pub fn bone_scale_count(&self) -> usize {
        self.inner.bone_scales.len()
    }

    /// Bone index for scale entry at given index.
    #[wasm_bindgen(js_name = "boneScaleBoneIndex")]
    pub fn bone_scale_bone_index(&self, i: usize) -> i32 {
        self.inner.bone_scales.get(i).map_or(-1, |e| e.bone_index)
    }

    /// Scale values [x, y, z] for bone scale entry at given index.
    #[wasm_bindgen(js_name = "boneScaleValues")]
    pub fn bone_scale_values(&self, i: usize) -> Option<Vec<f32>> {
        self.inner.bone_scales.get(i).map(|e| e.scale.to_vec())
    }

    /// Scale type for old-format entry (-1 if BoneScaleEx).
    #[wasm_bindgen(js_name = "boneScaleType")]
    pub fn bone_scale_type(&self, i: usize) -> i32 {
        self.inner
            .bone_scales
            .get(i)
            .map_or(-1, |e| e.scale_type.unwrap_or(-1))
    }

    /// Bone name used for foot offset calculation.
    #[wasm_bindgen(getter, js_name = "scaleBaseBone")]
    pub fn scale_base_bone(&self) -> Option<String> {
        self.inner.scale_base_bone.clone()
    }

    /// Default animation playback speed.
    #[wasm_bindgen(getter, js_name = "defPlaySpeed")]
    pub fn def_play_speed(&self) -> f32 {
        self.inner.def_play_speed
    }

    /// Number of child model attachments.
    #[wasm_bindgen(getter, js_name = "childCount")]
    pub fn child_count(&self) -> usize {
        self.inner.child_models.len()
    }

    /// Get the name of child model at the given index.
    #[wasm_bindgen(js_name = "childName")]
    pub fn child_name(&self, i: usize) -> Option<String> {
        self.inner.child_models.get(i).map(|c| c.name.clone())
    }

    /// Get the path of child model at the given index.
    #[wasm_bindgen(js_name = "childPath")]
    pub fn child_path(&self, i: usize) -> Option<String> {
        self.inner.child_models.get(i).map(|c| c.path.clone())
    }

    /// Get the parent hook name (HH) for child model at the given index.
    #[wasm_bindgen(js_name = "childHhName")]
    pub fn child_hh_name(&self, i: usize) -> Option<String> {
        self.inner.child_models.get(i).map(|c| c.hh_name.clone())
    }

    /// Get the child connection point (CC) for child model at the given index.
    #[wasm_bindgen(js_name = "childCcName")]
    pub fn child_cc_name(&self, i: usize) -> Option<String> {
        self.inner.child_models.get(i).map(|c| c.cc_name.clone())
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

    /// Track set directory name (e.g. "tcks_fallen_general").
    /// Present for SMD version >= 8; `undefined` for older versions.
    #[wasm_bindgen(getter, js_name = "tcksDir")]
    pub fn tcks_dir(&self) -> Option<String> {
        self.inner.tcks_dir.clone()
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

    /// Check if bone at the given index has the "flipped" flag.
    #[wasm_bindgen(js_name = "boneIsFlipped")]
    pub fn bone_is_flipped(&self, index: usize) -> bool {
        self.inner.bones.get(index).is_some_and(|b| b.is_flipped)
    }
}

/// Parsed SKI (skin) file containing meshes, textures, and materials.
#[wasm_bindgen]
pub struct Skin {
    inner: autoangel_core::model::ski::Skin,
}

#[wasm_bindgen]
impl Skin {
    /// Parse a SKI skin file from bytes.
    #[wasm_bindgen]
    pub fn parse(data: &[u8]) -> Result<Skin, JsError> {
        let ds = DataSource::from_bytes(data.to_vec());
        let inner = pollster::block_on(autoangel_core::model::ski::Skin::parse(&ds))
            .map_err(|e| crate::format_error(&e))?;
        Ok(Skin { inner })
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

    /// Bone names referenced by this skin (for remapping vertex bone indices to skeleton order).
    #[wasm_bindgen(getter, js_name = "boneNames")]
    pub fn bone_names(&self) -> Vec<String> {
        self.inner.bone_names.clone()
    }

    /// Total skeleton bone count from the header (identity remap range for SKI version < 9).
    #[wasm_bindgen(getter, js_name = "numSkeBone")]
    pub fn num_ske_bone(&self) -> u32 {
        self.inner.num_ske_bone
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
    /// w3 is computed as max(0, 1 - w0 - w1 - w2) to handle float precision.
    #[wasm_bindgen(js_name = "skinMeshBoneWeights")]
    pub fn skin_mesh_bone_weights(&self, index: usize) -> Option<Vec<f32>> {
        self.inner.skin_meshes.get(index).map(|m| {
            m.vertices
                .iter()
                .flat_map(|v| {
                    let w3 = (1.0 - v.weights[0] - v.weights[1] - v.weights[2]).max(0.0);
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

/// Parsed STCK (skeleton track set) file.
#[wasm_bindgen]
pub struct TrackSet {
    inner: autoangel_core::model::stck::TrackSet,
}

#[wasm_bindgen]
impl TrackSet {
    /// Parse a STCK animation track set from bytes.
    #[wasm_bindgen]
    pub fn parse(data: &[u8]) -> Result<TrackSet, JsError> {
        let ds = DataSource::from_bytes(data.to_vec());
        let inner = pollster::block_on(autoangel_core::model::stck::TrackSet::parse(&ds))
            .map_err(|e| crate::format_error(&e))?;
        Ok(TrackSet { inner })
    }

    #[wasm_bindgen(getter)]
    pub fn version(&self) -> u32 {
        self.inner.version
    }

    #[wasm_bindgen(getter, js_name = "animStart")]
    pub fn anim_start(&self) -> i32 {
        self.inner.anim_start
    }

    #[wasm_bindgen(getter, js_name = "animEnd")]
    pub fn anim_end(&self) -> i32 {
        self.inner.anim_end
    }

    #[wasm_bindgen(getter, js_name = "animFps")]
    pub fn anim_fps(&self) -> i32 {
        self.inner.anim_fps
    }

    #[wasm_bindgen(getter, js_name = "trackCount")]
    pub fn track_count(&self) -> usize {
        self.inner.bone_tracks.len()
    }

    #[wasm_bindgen(js_name = "boneId")]
    pub fn bone_id(&self, track_index: usize) -> i32 {
        self.inner
            .bone_tracks
            .get(track_index)
            .map_or(-1, |t| t.bone_id)
    }

    #[wasm_bindgen(js_name = "positionKeys")]
    pub fn position_keys(&self, track_index: usize) -> Option<Vec<f32>> {
        self.inner
            .bone_tracks
            .get(track_index)
            .map(|t| t.position.keys.clone())
    }

    #[wasm_bindgen(js_name = "rotationKeys")]
    pub fn rotation_keys(&self, track_index: usize) -> Option<Vec<f32>> {
        self.inner
            .bone_tracks
            .get(track_index)
            .map(|t| t.rotation.keys.clone())
    }

    #[wasm_bindgen(js_name = "positionFrameIds")]
    pub fn position_frame_ids(&self, track_index: usize) -> Option<Vec<u16>> {
        self.inner
            .bone_tracks
            .get(track_index)
            .and_then(|t| t.position.key_frame_ids.clone())
    }

    #[wasm_bindgen(js_name = "rotationFrameIds")]
    pub fn rotation_frame_ids(&self, track_index: usize) -> Option<Vec<u16>> {
        self.inner
            .bone_tracks
            .get(track_index)
            .and_then(|t| t.rotation.key_frame_ids.clone())
    }

    #[wasm_bindgen(js_name = "positionFrameRate")]
    pub fn position_frame_rate(&self, track_index: usize) -> i32 {
        self.inner
            .bone_tracks
            .get(track_index)
            .map_or(0, |t| t.position.frame_rate)
    }

    #[wasm_bindgen(js_name = "rotationFrameRate")]
    pub fn rotation_frame_rate(&self, track_index: usize) -> i32 {
        self.inner
            .bone_tracks
            .get(track_index)
            .map_or(0, |t| t.rotation.frame_rate)
    }

    #[wasm_bindgen(js_name = "positionTrackLengthMs")]
    pub fn position_track_length_ms(&self, track_index: usize) -> i32 {
        self.inner
            .bone_tracks
            .get(track_index)
            .map_or(0, |t| t.position.track_length_ms)
    }

    #[wasm_bindgen(js_name = "rotationTrackLengthMs")]
    pub fn rotation_track_length_ms(&self, track_index: usize) -> i32 {
        self.inner
            .bone_tracks
            .get(track_index)
            .map_or(0, |t| t.rotation.track_length_ms)
    }
}
