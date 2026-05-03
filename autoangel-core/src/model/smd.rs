use crate::model::bindable;
use crate::model::common::{detect_moxb_offset, read_astring, read_count};
use crate::util::data_source::{DataReader, DataSource};
use eyre::Result;
use macro_rules_attribute::apply;

const MAGIC: u32 = 0x41534D44; // "ASMD"
const HEADER_SIZE: u64 = 84;

#[apply(bindable)]
pub struct SmdModel {
    pub version: u32,
    pub skeleton_path: String,
    pub skin_paths: Vec<String>,
    /// Track set directory name (e.g. "tcks_fallen_general").
    /// Read from file for version >= 8; `None` for older versions.
    pub tcks_dir: Option<String>,
    /// Named animation clips slicing the BON timeline (BON v<6) or referencing
    /// per-action external `.stck` files (SMD v>=7).
    pub actions: Vec<SmdAction>,
}

/// A named animation clip referenced from the SMD action list.
#[apply(bindable)]
pub struct SmdAction {
    pub name: String,
    pub start_frame: f32,
    pub end_frame: f32,
    /// Frame rate stored per-action for SMD v>=9; `None` otherwise.
    pub frame_rate: Option<i32>,
    /// Per-action external `.stck` file name (SMD v>=7); `None` otherwise or
    /// when the file stores an empty string.
    pub tck_file: Option<String>,
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
        let num_actions = read_count(data, moxb + 12).await?;

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
            let (dir, len) = read_astring(&view).await?;
            offset += len;
            if dir.is_empty() { None } else { Some(dir) }
        } else {
            None
        };

        // Action list — names + frame ranges. Per-joint payloads in the
        // pre-v6 layout are read for accounting but discarded; the engine
        // itself only consumes the first joint's (start, end) range.
        let mut actions = Vec::with_capacity(num_actions);
        for _ in 0..num_actions {
            let view = data.get(offset..)?;
            let (name, len) = read_astring(&view).await?;
            offset += len;

            let (start_frame, end_frame, frame_rate) = match version {
                v if v < 6 => {
                    // FILEACTIONDATA: iActGroup(4), iNumJoint(4), dwFlags(4) = 12 bytes (discarded)
                    let num_joint_act = read_count(data, offset + 4).await?;
                    offset += 12;

                    // FILEJOINTACTION × num_joint_act, 20 bytes each:
                    //   iJoint(4), fStartFrame(4), fEndFrame(4), iNumLoop(4), fSpeedFactor(4)
                    // Engine only consumes the FIRST entry's (start, end) — mirror that.
                    let (s, e) = if num_joint_act >= 1 {
                        let s = data.get(offset + 4..offset + 8)?.as_le::<f32>().await?;
                        let e = data.get(offset + 8..offset + 12)?.as_le::<f32>().await?;
                        offset += 20;
                        offset += (num_joint_act as u64 - 1) * 20;
                        (s, e)
                    } else {
                        (0.0, 0.0)
                    };
                    (s, e, None)
                }
                v if v < 9 => {
                    // FILEACTIONDATA6 (8 bytes)
                    let s = data.get(offset..offset + 4)?.as_le::<f32>().await?;
                    let e = data.get(offset + 4..offset + 8)?.as_le::<f32>().await?;
                    offset += 8;
                    (s, e, None)
                }
                _ => {
                    // FILEACTIONDATA9 (12 bytes): adds per-action frame rate
                    let s = data.get(offset..offset + 4)?.as_le::<f32>().await?;
                    let e = data.get(offset + 4..offset + 8)?.as_le::<f32>().await?;
                    let fps = data.get(offset + 8..offset + 12)?.as_le::<i32>().await?;
                    offset += 12;
                    (s, e, Some(fps))
                }
            };

            let tck_file = if version >= 7 {
                let view = data.get(offset..)?;
                let (s, len) = read_astring(&view).await?;
                offset += len;
                if s.is_empty() { None } else { Some(s) }
            } else {
                None
            };

            actions.push(SmdAction {
                name,
                start_frame,
                end_frame,
                frame_rate,
                tck_file,
            });
        }

        Ok(SmdModel {
            version,
            skeleton_path,
            skin_paths,
            tcks_dir,
            actions,
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
    fn carnivore_plant_bon_smd_consistency() {
        use crate::model::bon::Skeleton;
        let smd_bytes = include_test_data_bytes!("models/carnivore_plant/carnivore_plant.smd");
        let bon_bytes = include_test_data_bytes!("models/carnivore_plant/花苞食人花_b.bon");
        let smd = pollster::block_on(SmdModel::parse(&DataSource::from_bytes(smd_bytes.to_vec())))
            .unwrap();
        let bon = pollster::block_on(Skeleton::parse(&DataSource::from_bytes(bon_bytes.to_vec())))
            .unwrap();
        let last = smd.actions.last().expect("at least one action");
        let anim_end = bon
            .embedded_animation
            .as_ref()
            .and_then(|a| a.anim_end)
            .expect("anim_end present");
        assert_eq!(anim_end as f32, last.end_frame);
    }

    #[test]
    fn parse_carnivore_plant_smd_actions() {
        let bytes = include_test_data_bytes!("models/carnivore_plant/carnivore_plant.smd");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let smd = pollster::block_on(SmdModel::parse(&ds)).unwrap();
        assert_eq!(smd.version, 5);
        assert_eq!(smd.actions.len(), 16);
        assert_eq!(smd.actions[0].name, "挂点");
        assert_eq!(smd.actions[0].start_frame, 0.0);
        assert_eq!(smd.actions[0].end_frame, 1.0);
        assert_eq!(smd.actions[15].name, "受伤叠加");
        assert_eq!(smd.actions[15].end_frame, 407.0);
        assert!(smd.actions.iter().all(|a| a.tck_file.is_none()));
        assert!(smd.actions.iter().all(|a| a.frame_rate.is_none()));
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
