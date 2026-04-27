use crate::model::bindable;
use crate::model::common::{decode_gbk, detect_moxb_offset, read_count, read_cstring};
use crate::util::data_source::{DataReader, DataSource};
use eyre::Result;
use macro_rules_attribute::apply;

const OUTER_COLLIDE_ONLY: u32 = 0x80000001;

const MESH_VERSION_V4: u32 = 0x10000004;
const MESH_VERSION_V5: u32 = 0x10000005;
const MESH_VERSION_V6: u32 = 0x10000006;

/// Parsed BMD ("MOXB"-prefixed A3DLitModel + optional convex-hull tail).
/// Hull data is parsed-past, never returned.
#[apply(bindable)]
pub struct BmdModel {
    pub version: u32,
    pub collide_only: bool,
    pub scale: [f32; 3],
    pub dir: [f32; 3],
    pub up: [f32; 3],
    pub pos: [f32; 3],
    pub meshes: Vec<BmdMesh>,
}

#[apply(bindable)]
pub struct BmdMesh {
    pub version: u32,
    pub name: String,
    pub texture_map: String,
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub uvs: Vec<[f32; 2]>,
    pub indices: Vec<u16>,
    pub aabb_min: [f32; 3],
    pub aabb_max: [f32; 3],
    pub material: Option<BmdMaterial>,
}

#[apply(bindable)]
pub struct BmdMaterial {
    pub diffuse: [f32; 4],
    pub ambient: [f32; 4],
    pub specular: [f32; 4],
    pub emissive: [f32; 4],
    pub power: f32,
    pub two_sided: bool,
}

async fn read_vec3<R: DataReader>(data: &DataSource<R>, offset: u64) -> Result<[f32; 3]> {
    Ok([
        data.get(offset..offset + 4)?.as_le::<f32>().await?,
        data.get(offset + 4..offset + 8)?.as_le::<f32>().await?,
        data.get(offset + 8..offset + 12)?.as_le::<f32>().await?,
    ])
}

/// Decode a fixed-size NUL-padded GBK byte buffer (e.g. szName[64]).
async fn read_fixed_gbk<R: DataReader>(
    data: &DataSource<R>,
    offset: u64,
    size: u64,
) -> Result<String> {
    let raw = data.get(offset..offset + size)?.to_bytes().await?;
    let trimmed_len = raw.iter().position(|&b| b == 0).unwrap_or(raw.len());
    decode_gbk(&raw[..trimmed_len])
}

/// Read the 4 × vec3 transform block + numMeshes int. Returns
/// (scale, dir, up, pos, num_meshes, offset_after).
async fn read_transform_block<R: DataReader>(
    data: &DataSource<R>,
    start: u64,
) -> Result<([f32; 3], [f32; 3], [f32; 3], [f32; 3], usize, u64)> {
    let scale = read_vec3(data, start).await?;
    let dir = read_vec3(data, start + 12).await?;
    let up = read_vec3(data, start + 24).await?;
    let pos = read_vec3(data, start + 36).await?;
    let num_meshes = read_count(data, start + 48).await?;
    Ok((scale, dir, up, pos, num_meshes, start + 52))
}

impl BmdModel {
    pub async fn parse<R: DataReader>(data: &DataSource<R>) -> Result<Self> {
        let mut off = detect_moxb_offset(data).await?;

        if data.size() < off + 4 {
            eyre::bail!("BMD too small for outer version: {} bytes", data.size());
        }
        let mut version = data.get(off..off + 4)?.as_le::<u32>().await?;
        off += 4;

        let mut collide_only = false;
        if version == OUTER_COLLIDE_ONLY {
            collide_only = true;
            // Skip 1-byte bCollideOnly flag, then re-read the real version.
            off += 1;
            if data.size() < off + 4 {
                eyre::bail!("BMD truncated after collide-only sentinel");
            }
            version = data.get(off..off + 4)?.as_le::<u32>().await?;
            off += 4;
        }

        if data.size() < off + 52 {
            eyre::bail!("BMD truncated in transform block");
        }
        let (scale, dir, up, pos, num_meshes, mut off2) = read_transform_block(data, off).await?;

        let mut meshes = Vec::with_capacity(num_meshes);
        for _ in 0..num_meshes {
            let (mesh, next) = parse_mesh(data, off2).await?;
            meshes.push(mesh);
            off2 = next;
        }

        Ok(BmdModel {
            version,
            collide_only,
            scale,
            dir,
            up,
            pos,
            meshes,
        })
    }
}

async fn parse_mesh<R: DataReader>(data: &DataSource<R>, start: u64) -> Result<(BmdMesh, u64)> {
    if data.size() < start + 4 {
        eyre::bail!("BMD truncated at mesh dmVersion");
    }
    let dm_version = data.get(start..start + 4)?.as_le::<u32>().await?;
    let off = start + 4;

    let (read_extra_colors_byte, has_material) = match dm_version {
        MESH_VERSION_V4 => (false, false),
        MESH_VERSION_V5 => (false, true),
        MESH_VERSION_V6 => (true, true),
        other => eyre::bail!("BMD: unsupported mesh dmVersion 0x{other:08X} at offset {off}"),
    };
    parse_mesh_body(data, dm_version, off, read_extra_colors_byte, has_material).await
}

async fn parse_mesh_body<R: DataReader>(
    data: &DataSource<R>,
    version: u32,
    start: u64,
    read_extra_colors_byte: bool,
    has_material: bool,
) -> Result<(BmdMesh, u64)> {
    let name = read_fixed_gbk(data, start, 64).await?;
    let mut off = start + 64;
    let texture_map = read_fixed_gbk(data, off, 256).await?;
    off += 256;

    let n_verts = read_count(data, off).await?;
    off += 4;
    let n_faces = read_count(data, off).await?;
    off += 4;

    let has_extra_colors = if read_extra_colors_byte {
        let b = data.get(off..off + 1)?.to_bytes().await?[0] != 0;
        off += 1;
        b
    } else {
        false
    };

    // A3DLMVERTEX_WITHOUTNORMAL: float3 pos, u32 diffuse, float u, float v = 24 bytes
    const VERT_SIZE: u64 = 24;
    let vert_block = data.get(off..off + VERT_SIZE * n_verts as u64)?;
    let mut positions = Vec::with_capacity(n_verts);
    let mut uvs = Vec::with_capacity(n_verts);
    for i in 0..n_verts as u64 {
        let v = vert_block.get(i * VERT_SIZE..(i + 1) * VERT_SIZE)?;
        positions.push([
            v.get(0..4)?.as_le::<f32>().await?,
            v.get(4..8)?.as_le::<f32>().await?,
            v.get(8..12)?.as_le::<f32>().await?,
        ]);
        uvs.push([
            v.get(16..20)?.as_le::<f32>().await?,
            v.get(20..24)?.as_le::<f32>().await?,
        ]);
    }
    off += VERT_SIZE * n_verts as u64;

    let n_indices = n_faces * 3;
    let mut indices = Vec::with_capacity(n_indices);
    let idx_block = data.get(off..off + 2 * n_indices as u64)?;
    for i in 0..n_indices as u64 {
        indices.push(idx_block.get(i * 2..(i + 1) * 2)?.as_le::<u16>().await?);
    }
    off += 2 * n_indices as u64;

    let normal_block = data.get(off..off + 12 * n_verts as u64)?;
    let mut normals = Vec::with_capacity(n_verts);
    for i in 0..n_verts as u64 {
        let n = normal_block.get(i * 12..(i + 1) * 12)?;
        normals.push([
            n.get(0..4)?.as_le::<f32>().await?,
            n.get(4..8)?.as_le::<f32>().await?,
            n.get(8..12)?.as_le::<f32>().await?,
        ]);
    }
    off += 12 * n_verts as u64;

    // Skip day + night colour arrays (4N bytes each); V6 with extra colours
    // adds another pair.
    let colour_arrays = if has_extra_colors { 4 } else { 2 };
    off += colour_arrays * 4 * n_verts as u64;

    let (aabb_min, aabb_max, after_aabb) = read_aabb(data, off).await?;
    off = after_aabb;

    let material = if has_material {
        let (mat, after) = read_material(data, off).await?;
        off = after;
        Some(mat)
    } else {
        None
    };

    Ok((
        BmdMesh {
            version,
            name,
            texture_map,
            positions,
            normals,
            uvs,
            indices,
            aabb_min,
            aabb_max,
            material,
        },
        off,
    ))
}

/// A3DAABB: center(vec3) + extents(vec3) + mins(vec3) + maxs(vec3) = 48 bytes.
/// Center and extents are derivable from min/max, so we skip them.
async fn read_aabb<R: DataReader>(
    data: &DataSource<R>,
    start: u64,
) -> Result<([f32; 3], [f32; 3], u64)> {
    if data.size() < start + 48 {
        eyre::bail!("BMD truncated at AABB");
    }
    let mins = read_vec3(data, start + 24).await?;
    let maxs = read_vec3(data, start + 36).await?;
    Ok((mins, maxs, start + 48))
}

async fn read_color4<R: DataReader>(data: &DataSource<R>, off: u64) -> Result<[f32; 4]> {
    Ok([
        data.get(off..off + 4)?.as_le::<f32>().await?,
        data.get(off + 4..off + 8)?.as_le::<f32>().await?,
        data.get(off + 8..off + 12)?.as_le::<f32>().await?,
        data.get(off + 12..off + 16)?.as_le::<f32>().await?,
    ])
}

/// A3DMaterial::Load (binary path): NUL-terminated "MATERIAL: <name>" string,
/// then 4 × A3DCOLORVALUE in the order Ambient, Diffuse, Emissive, Specular,
/// then power (f32) and 2-sided byte. Total = name_len + 1 + 64 + 4 + 1.
async fn read_material<R: DataReader>(
    data: &DataSource<R>,
    start: u64,
) -> Result<(BmdMaterial, u64)> {
    let view = data.get(start..)?;
    let (_name, name_consumed) = read_cstring(&view).await?;
    let mut off = start + name_consumed;

    if data.size() < off + 69 {
        eyre::bail!("BMD truncated at material body");
    }
    let ambient = read_color4(data, off).await?;
    off += 16;
    let diffuse = read_color4(data, off).await?;
    off += 16;
    let emissive = read_color4(data, off).await?;
    off += 16;
    let specular = read_color4(data, off).await?;
    off += 16;
    let power = data.get(off..off + 4)?.as_le::<f32>().await?;
    off += 4;
    let two_sided = data.get(off..off + 1)?.to_bytes().await?[0] != 0;
    off += 1;
    Ok((
        BmdMaterial {
            diffuse,
            ambient,
            specular,
            emissive,
            power,
            two_sided,
        },
        off,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::include_test_data_bytes;

    fn ds(bytes: &[u8]) -> DataSource<Vec<u8>> {
        DataSource::from_bytes(bytes.to_vec())
    }

    #[test]
    fn parse_v4_fixture() {
        let bytes = include_test_data_bytes!("models/bmd/v4_litmodel_268.bmd");
        let m = pollster::block_on(BmdModel::parse(&ds(bytes))).unwrap();
        assert_eq!(m.version, 0x10000002);
        assert!(!m.collide_only);
        assert_eq!(m.meshes.len(), 1);
        let mesh = &m.meshes[0];
        assert_eq!(mesh.version, MESH_VERSION_V4);
        assert!(mesh.name.starts_with("Object") || !mesh.name.is_empty());
        assert!(
            mesh.texture_map.to_lowercase().ends_with(".dds")
                || mesh.texture_map.to_lowercase().ends_with(".tga")
        );
        assert!(!mesh.positions.is_empty());
        assert_eq!(mesh.positions.len(), mesh.normals.len());
        assert_eq!(mesh.positions.len(), mesh.uvs.len());
        assert_eq!(mesh.indices.len() % 3, 0);
        assert!(mesh.material.is_none());
    }

    #[test]
    fn parse_v5_fixture() {
        let bytes = include_test_data_bytes!("models/bmd/v5_litmodel_5647.bmd");
        let m = pollster::block_on(BmdModel::parse(&ds(bytes))).unwrap();
        assert_eq!(m.meshes.len(), 1);
        let mesh = &m.meshes[0];
        assert_eq!(mesh.version, MESH_VERSION_V5);
        let mat = mesh.material.as_ref().expect("V5 must carry material");
        // Sanity check: power and colour components are finite.
        assert!(mat.power.is_finite());
        for c in [&mat.diffuse, &mat.ambient, &mat.specular, &mat.emissive] {
            for f in c {
                assert!(f.is_finite());
            }
        }
    }

    #[test]
    fn parse_v6_fixture() {
        let bytes = include_test_data_bytes!("models/bmd/v6_litmodel_669.bmd");
        let m = pollster::block_on(BmdModel::parse(&ds(bytes))).unwrap();
        assert_eq!(m.meshes.len(), 1);
        let mesh = &m.meshes[0];
        assert_eq!(mesh.version, MESH_VERSION_V6);
        assert!(mesh.material.is_some());
        assert!(!mesh.positions.is_empty());
    }

    #[test]
    fn reject_truncated_outer() {
        let buf = vec![0x4D, 0x4F, 0x58, 0x42, 0x02]; // MOXB + partial version
        assert!(pollster::block_on(BmdModel::parse(&ds(&buf))).is_err());
    }

    #[test]
    fn reject_unknown_mesh_version() {
        // MOXB + outer 0x10000002 + 4 zero vec3 + 1 mesh + dmVersion 0x10000007
        let mut buf = vec![0x4D, 0x4F, 0x58, 0x42];
        buf.extend_from_slice(&0x10000002u32.to_le_bytes());
        buf.extend_from_slice(&[0u8; 48]); // scale/dir/up/pos
        buf.extend_from_slice(&1i32.to_le_bytes()); // num meshes
        buf.extend_from_slice(&0x10000007u32.to_le_bytes()); // unsupported
        let err = pollster::block_on(BmdModel::parse(&ds(&buf))).unwrap_err();
        assert!(err.to_string().contains("unsupported mesh dmVersion"));
    }

    #[test]
    fn reject_negative_mesh_count() {
        let mut buf = vec![0x4D, 0x4F, 0x58, 0x42];
        buf.extend_from_slice(&0x10000002u32.to_le_bytes());
        buf.extend_from_slice(&[0u8; 48]);
        buf.extend_from_slice(&(-1i32).to_le_bytes()); // negative count
        assert!(pollster::block_on(BmdModel::parse(&ds(&buf))).is_err());
    }

    #[test]
    fn missing_moxb_magic_still_parses_when_outer_starts_directly() {
        // Engine source path supports raw A3DLitModel without MOXB prefix.
        // detect_moxb_offset returns 0 → outer version read directly.
        // Use an arbitrary non-collide-only outer version with 0 meshes — this
        // documents BMD's lenient outer-version policy: only mesh-version
        // dispatch validates content.
        let mut buf = vec![];
        buf.extend_from_slice(&0xDEADBEEFu32.to_le_bytes()); // bogus outer
        buf.extend_from_slice(&[0u8; 48]);
        buf.extend_from_slice(&0i32.to_le_bytes()); // 0 meshes
        let m = pollster::block_on(BmdModel::parse(&ds(&buf))).unwrap();
        assert_eq!(m.version, 0xDEADBEEF);
        assert_eq!(m.meshes.len(), 0);
    }
}
