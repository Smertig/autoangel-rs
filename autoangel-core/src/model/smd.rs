use crate::model::common::{detect_moxb_offset, read_astring, read_count};
use crate::util::data_source::{DataReader, DataSource};
use eyre::Result;

const MAGIC: u32 = 0x41534D44; // "ASMD"
const HEADER_SIZE: u64 = 84;

#[derive(Debug, Clone)]
pub struct SmdModel {
    pub version: u32,
    pub skeleton_path: String,
    pub skin_paths: Vec<String>,
    /// Track set directory name (e.g. "tcks_fallen_general").
    /// Read from file for version >= 8; `None` for older versions.
    pub tcks_dir: Option<String>,
}

impl SmdModel {
    pub async fn parse<R: DataReader>(data: &DataSource<R>) -> Result<Self> {
        let moxb = detect_moxb_offset(data).await?;

        if data.size() < moxb + HEADER_SIZE {
            eyre::bail!(
                "SMD file too small: {} bytes (need at least {})",
                data.size(),
                moxb + HEADER_SIZE
            );
        }

        let magic = data.get(moxb..moxb + 4)?.as_le::<u32>().await?;
        if magic != MAGIC {
            eyre::bail!("Invalid SMD magic: {magic:08X}, expected {MAGIC:08X}");
        }

        let version = data.get(moxb + 4..moxb + 8)?.as_le::<u32>().await?;
        let num_skins = read_count(data, moxb + 8).await?;

        let mut offset = moxb + HEADER_SIZE;

        // Skeleton path
        let view = data.get(offset..)?;
        let (skeleton_path, len) = read_astring(&view).await?;
        offset += len;

        // Skin paths
        let mut skin_paths = Vec::with_capacity(num_skins);
        for _ in 0..num_skins {
            let view = data.get(offset..)?;
            let (path, len) = read_astring(&view).await?;
            skin_paths.push(path);
            offset += len;
        }

        // Physique path (always present after skin paths, skip)
        let view = data.get(offset..)?;
        let (_, len) = read_astring(&view).await?;
        offset += len;

        // Track set directory (version >= 8 stores it explicitly)
        let tcks_dir = if version >= 8 {
            let view = data.get(offset..)?;
            let (dir, _len) = read_astring(&view).await?;
            if dir.is_empty() { None } else { Some(dir) }
        } else {
            None
        };

        Ok(SmdModel {
            version,
            skeleton_path,
            skin_paths,
            tcks_dir,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::include_test_data_bytes;

    #[test]
    fn parse_carnivore_plant_smd() {
        let bytes = include_test_data_bytes!("models/carnivore_plant/carnivore_plant.smd");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let smd = pollster::block_on(SmdModel::parse(&ds)).unwrap();
        assert_eq!(smd.version, 5);
        assert_eq!(smd.skin_paths.len(), 1);
        assert!(smd.skeleton_path.ends_with(".bon"));
    }

    #[test]
    fn parse_fallen_general_smd() {
        let bytes = include_test_data_bytes!("models/fallen_general/fallen_general.smd");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let smd = pollster::block_on(SmdModel::parse(&ds)).unwrap();
        assert_eq!(smd.version, 5);
        assert_eq!(smd.skin_paths.len(), 0);
        assert!(smd.skeleton_path.ends_with(".bon"));
    }

    #[test]
    fn reject_bad_magic() {
        let mut buf = vec![0xDE, 0xAD, 0xBE, 0xEF];
        buf.extend_from_slice(&5u32.to_le_bytes());
        buf.extend_from_slice(&[0u8; 76]); // rest of header
        let ds = DataSource::from_bytes(buf);
        assert!(pollster::block_on(SmdModel::parse(&ds)).is_err());
    }

    #[test]
    fn reject_truncated() {
        let ds = DataSource::from_bytes(vec![0u8; 10]);
        assert!(pollster::block_on(SmdModel::parse(&ds)).is_err());
    }
}
