use crate::model::common::{detect_moxb_offset, read_astring, read_count, read_cstring};
use crate::util::data_source::{DataReader, DataSource};
use eyre::Result;

const MAGIC: u32 = 0x41534B49; // "ASKI"
const HEADER_SIZE: u64 = 104;

#[derive(Debug, Clone)]
pub struct Skin {
    pub version: u32,
    pub textures: Vec<String>,
    pub materials: Vec<Material>,
    pub skin_meshes: Vec<SkinMesh>,
    pub rigid_meshes: Vec<RigidMesh>,
    pub bone_names: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Material {
    pub name: String,
    pub ambient: [f32; 4],
    pub diffuse: [f32; 4],
    pub emissive: [f32; 4],
    pub specular: [f32; 4],
    pub power: f32,
    pub two_sided: bool,
}

#[derive(Debug, Clone)]
pub struct SkinMesh {
    pub name: String,
    pub texture_index: i32,
    pub material_index: i32,
    pub vertices: Vec<SkinVertex>,
    pub indices: Vec<u16>,
}

#[derive(Debug, Clone, Copy)]
pub struct SkinVertex {
    pub position: [f32; 3],
    pub weights: [f32; 3],
    pub bone_indices: [u8; 4],
    pub normal: [f32; 3],
    pub u: f32,
    pub v: f32,
}

#[derive(Debug, Clone)]
pub struct RigidMesh {
    pub name: String,
    pub bone_index: i32,
    pub texture_index: i32,
    pub material_index: i32,
    pub vertices: Vec<RigidVertex>,
    pub indices: Vec<u16>,
}

#[derive(Debug, Clone, Copy)]
pub struct RigidVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub u: f32,
    pub v: f32,
}

async fn read_color<R: DataReader>(data: &DataSource<R>) -> Result<[f32; 4]> {
    Ok([
        data.get(0..4)?.as_le::<f32>().await?,
        data.get(4..8)?.as_le::<f32>().await?,
        data.get(8..12)?.as_le::<f32>().await?,
        data.get(12..16)?.as_le::<f32>().await?,
    ])
}

impl Skin {
    pub async fn parse<R: DataReader>(data: &DataSource<R>) -> Result<Self> {
        let moxb = detect_moxb_offset(data).await?;

        if data.size() < moxb + HEADER_SIZE {
            eyre::bail!("SKI file too small: {} bytes", data.size());
        }

        let magic = data.get(moxb..moxb + 4)?.as_le::<u32>().await?;
        if magic != MAGIC {
            eyre::bail!("Invalid SKI magic: {magic:08X}, expected {MAGIC:08X}");
        }

        let version = data.get(moxb + 4..moxb + 8)?.as_le::<u32>().await?;
        let num_skin_mesh = read_count(data, moxb + 8).await?;
        let num_rigid_mesh = read_count(data, moxb + 12).await?;
        let _num_morph_sk_mesh = data.get(moxb + 16..moxb + 20)?.as_le::<i32>().await?;
        let _num_morph_rd_mesh = data.get(moxb + 20..moxb + 24)?.as_le::<i32>().await?;
        let num_texture = read_count(data, moxb + 24).await?;
        let num_material = read_count(data, moxb + 28).await?;
        let num_skin_bone = read_count(data, moxb + 32).await?;
        // fMinWeight at moxb+36..moxb+40 (float, skip)
        // iNumSkeBone at moxb+40..moxb+44
        // iNumSuppleMesh at moxb+44..moxb+48
        // iNumMuscleMesh at moxb+48..moxb+52
        // reserved: 52 bytes (moxb+52..moxb+104)

        let mut offset = moxb + HEADER_SIZE;

        // Bone names (only present if version >= 9 and num_skin_bone > 0)
        let mut bone_names = Vec::new();
        if version >= 9 && num_skin_bone > 0 {
            bone_names.reserve(num_skin_bone);
            for _ in 0..num_skin_bone {
                let view = data.get(offset..)?;
                let (name, name_len) = read_astring(&view).await?;
                offset += name_len;
                bone_names.push(name);
            }
        }

        // Textures
        let mut textures = Vec::with_capacity(num_texture);
        for _ in 0..num_texture {
            let view = data.get(offset..)?;
            let (name, name_len) = read_astring(&view).await?;
            offset += name_len;
            textures.push(name);
        }

        // Materials
        let mut materials = Vec::with_capacity(num_material);
        for _ in 0..num_material {
            let view = data.get(offset..)?;
            let (name, name_len) = read_cstring(&view).await?;
            offset += name_len;

            let mat_data = data.get(offset..offset + 69)?;
            let ambient = read_color(&mat_data.get(0..16)?).await?;
            let diffuse = read_color(&mat_data.get(16..32)?).await?;
            let emissive = read_color(&mat_data.get(32..48)?).await?;
            let specular = read_color(&mat_data.get(48..64)?).await?;
            let power = mat_data.get(64..68)?.as_le::<f32>().await?;
            let two_sided_ds = mat_data.get(68..69)?;
            let two_sided_bytes = two_sided_ds.to_bytes().await?;
            let two_sided = two_sided_bytes[0] != 0;
            offset += 69;

            materials.push(Material {
                name,
                ambient,
                diffuse,
                emissive,
                specular,
                power,
                two_sided,
            });
        }

        // Skin meshes
        let mut skin_meshes = Vec::with_capacity(num_skin_mesh);
        for _ in 0..num_skin_mesh {
            let view = data.get(offset..)?;
            let (name, name_len) = read_astring(&view).await?;
            offset += name_len;

            // SKINMESHDATA: 16 bytes
            let smd = data.get(offset..offset + 16)?;
            let texture_index = smd.get(0..4)?.as_le::<i32>().await?;
            let material_index = smd.get(4..8)?.as_le::<i32>().await?;
            let num_verts = read_count(&smd, 8).await?;
            let num_indices = read_count(&smd, 12).await?;
            offset += 16;

            // Vertices: num_verts * 48 bytes
            let mut vertices = Vec::with_capacity(num_verts);
            for _ in 0..num_verts {
                let vd = data.get(offset..offset + 48)?;
                let position = [
                    vd.get(0..4)?.as_le::<f32>().await?,
                    vd.get(4..8)?.as_le::<f32>().await?,
                    vd.get(8..12)?.as_le::<f32>().await?,
                ];
                let weights = [
                    vd.get(12..16)?.as_le::<f32>().await?,
                    vd.get(16..20)?.as_le::<f32>().await?,
                    vd.get(20..24)?.as_le::<f32>().await?,
                ];
                let bi_ds = vd.get(24..28)?;
                let bi_bytes = bi_ds.to_bytes().await?;
                let bone_indices = [bi_bytes[0], bi_bytes[1], bi_bytes[2], bi_bytes[3]];
                let normal = [
                    vd.get(28..32)?.as_le::<f32>().await?,
                    vd.get(32..36)?.as_le::<f32>().await?,
                    vd.get(36..40)?.as_le::<f32>().await?,
                ];
                let u = vd.get(40..44)?.as_le::<f32>().await?;
                let v = vd.get(44..48)?.as_le::<f32>().await?;
                offset += 48;

                vertices.push(SkinVertex {
                    position,
                    weights,
                    bone_indices,
                    normal,
                    u,
                    v,
                });
            }

            // Indices: num_indices * u16
            let mut indices = Vec::with_capacity(num_indices);
            for _ in 0..num_indices {
                indices.push(data.get(offset..offset + 2)?.as_le::<u16>().await?);
                offset += 2;
            }

            // Tangent data for version 100/101
            if version == 100 || version == 101 {
                offset += num_verts as u64 * 16;
            }

            skin_meshes.push(SkinMesh {
                name,
                texture_index,
                material_index,
                vertices,
                indices,
            });
        }

        // Rigid meshes
        let mut rigid_meshes = Vec::with_capacity(num_rigid_mesh);
        for _ in 0..num_rigid_mesh {
            let view = data.get(offset..)?;
            let (name, name_len) = read_astring(&view).await?;
            offset += name_len;

            // RIGIDMESHDATA: 20 bytes
            let rmd = data.get(offset..offset + 20)?;
            let bone_index = rmd.get(0..4)?.as_le::<i32>().await?;
            let texture_index = rmd.get(4..8)?.as_le::<i32>().await?;
            let material_index = rmd.get(8..12)?.as_le::<i32>().await?;
            let num_verts = read_count(&rmd, 12).await?;
            let num_indices = read_count(&rmd, 16).await?;
            offset += 20;

            // Vertices: num_verts * 32 bytes (A3DVERTEX)
            let mut vertices = Vec::with_capacity(num_verts);
            for _ in 0..num_verts {
                let vd = data.get(offset..offset + 32)?;
                let position = [
                    vd.get(0..4)?.as_le::<f32>().await?,
                    vd.get(4..8)?.as_le::<f32>().await?,
                    vd.get(8..12)?.as_le::<f32>().await?,
                ];
                let normal = [
                    vd.get(12..16)?.as_le::<f32>().await?,
                    vd.get(16..20)?.as_le::<f32>().await?,
                    vd.get(20..24)?.as_le::<f32>().await?,
                ];
                let u = vd.get(24..28)?.as_le::<f32>().await?;
                let v = vd.get(28..32)?.as_le::<f32>().await?;
                offset += 32;

                vertices.push(RigidVertex {
                    position,
                    normal,
                    u,
                    v,
                });
            }

            // Indices: num_indices * u16
            let mut indices = Vec::with_capacity(num_indices);
            for _ in 0..num_indices {
                indices.push(data.get(offset..offset + 2)?.as_le::<u16>().await?);
                offset += 2;
            }

            // Tangent data for version 100/101
            if version == 100 || version == 101 {
                offset += num_verts as u64 * 16;
            }

            rigid_meshes.push(RigidMesh {
                name,
                bone_index,
                texture_index,
                material_index,
                vertices,
                indices,
            });
        }

        // Skip morph/supple/muscle meshes for MVP

        Ok(Skin {
            version,
            textures,
            materials,
            skin_meshes,
            rigid_meshes,
            bone_names,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::include_test_data_bytes;

    #[test]
    fn parse_carnivore_plant_ski() {
        let bytes = include_test_data_bytes!("models/carnivore_plant/carnivore_plant.ski");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let skin = pollster::block_on(Skin::parse(&ds)).unwrap();
        assert_eq!(skin.version, 8);
        assert_eq!(skin.skin_meshes.len(), 2);
        assert_eq!(skin.rigid_meshes.len(), 0);
        assert_eq!(skin.textures.len(), 2);
        assert_eq!(skin.materials.len(), 2);
        assert!(!skin.skin_meshes[0].vertices.is_empty());
        assert!(!skin.skin_meshes[0].indices.is_empty());
    }

    #[test]
    fn parse_fallen_general_ski() {
        let bytes = include_test_data_bytes!("models/fallen_general/fallen_general.ski");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let skin = pollster::block_on(Skin::parse(&ds)).unwrap();
        assert_eq!(skin.version, 8);
        assert_eq!(skin.skin_meshes.len(), 2);
        assert_eq!(skin.textures.len(), 2);
    }

    #[test]
    fn reject_bad_magic() {
        let mut buf = vec![0xDE, 0xAD, 0xBE, 0xEF];
        buf.extend_from_slice(&[0u8; 100]);
        let ds = DataSource::from_bytes(buf);
        assert!(pollster::block_on(Skin::parse(&ds)).is_err());
    }

    #[test]
    fn reject_truncated() {
        let ds = DataSource::from_bytes(vec![0u8; 10]);
        assert!(pollster::block_on(Skin::parse(&ds)).is_err());
    }
}
