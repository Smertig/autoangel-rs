use crate::model::bindable;
use crate::model::common::{detect_moxb_offset, read_astring, read_count, read_matrix};
use crate::model::stck;
use crate::util::data_source::{DataReader, DataSource};
use eyre::Result;
use macro_rules_attribute::apply;

const MAGIC: u32 = 0x41534B45; // "ASKE"
const HEADER_SIZE: u64 = 96;
const BONEDATA_SIZE: u64 = 144;
const JOINTDATA_SIZE: u64 = 12;
const HOOKDATA_SIZE: u64 = 72;

#[apply(bindable)]
pub struct Skeleton {
    pub version: u32,
    pub bones: Vec<Bone>,
    pub hooks: Vec<Hook>,
    pub embedded_animation: Option<stck::Animation>,
}

#[apply(bindable)]
pub struct Bone {
    pub name: String,
    pub parent: i32,
    pub children: Vec<i32>,
    pub mat_relative: [f32; 16],
    pub mat_bone_init: [f32; 16],
    pub is_fake: bool,
    pub is_flipped: bool,
}

#[apply(bindable)]
#[derive(Default)]
pub struct Hook {
    pub name: String,
    pub hook_type: u32,
    pub bone_index: i32,
    pub transform: [f32; 16],
}

impl Skeleton {
    pub async fn parse<R: DataReader>(data: &DataSource<R>) -> Result<Self> {
        let moxb = detect_moxb_offset(data).await?;

        if data.size() < moxb + HEADER_SIZE {
            eyre::bail!("BON file too small: {} bytes", data.size());
        }

        let magic = data.get(moxb..moxb + 4)?.as_le::<u32>().await?;
        if magic != MAGIC {
            eyre::bail!("Invalid BON magic: {magic:08X}, expected {MAGIC:08X}");
        }

        let version = data.get(moxb + 4..moxb + 8)?.as_le::<u32>().await?;
        let num_bones = read_count(data, moxb + 8).await?;
        let num_joints = read_count(data, moxb + 12).await?;
        let num_hooks = read_count(data, moxb + 16).await?;
        let anim_start = data.get(moxb + 20..moxb + 24)?.as_le::<i32>().await?;
        let anim_end = data.get(moxb + 24..moxb + 28)?.as_le::<i32>().await?;
        let anim_fps = data.get(moxb + 28..moxb + 32)?.as_le::<i32>().await?;

        let mut offset = moxb + HEADER_SIZE;

        // Parse bones
        let mut bones = Vec::with_capacity(num_bones);
        for _ in 0..num_bones {
            let view = data.get(offset..)?;
            let (name, name_len) = read_astring(&view).await?;
            offset += name_len;

            let bd = data.get(offset..offset + BONEDATA_SIZE)?;
            let flags = bd.get(0..4)?.as_le::<u32>().await?;
            let parent = bd.get(4..8)?.as_le::<i32>().await?;
            let _first_joint = bd.get(8..12)?.as_le::<i32>().await?;
            let num_children = read_count(&bd, 12).await?;
            let mat_relative = read_matrix(&bd.get(16..80)?).await?;
            let mat_bone_init = read_matrix(&bd.get(80..144)?).await?;
            offset += BONEDATA_SIZE;

            let mut children = Vec::with_capacity(num_children);
            for _ in 0..num_children {
                children.push(data.get(offset..offset + 4)?.as_le::<i32>().await?);
                offset += 4;
            }

            bones.push(Bone {
                name,
                parent,
                children,
                mat_relative,
                mat_bone_init,
                is_fake: (flags & 0x01) != 0,
                is_flipped: (flags & 0x02) != 0,
            });
        }

        // Parse joints (+ embedded tracks for version < 6)
        let mut bone_tracks: Vec<stck::BoneTrack> = Vec::with_capacity(num_joints);
        if num_joints > 0 {
            // Joint type IDs array
            offset += num_joints as u64 * 4;

            for i in 0..num_joints {
                // Joint name
                let view = data.get(offset..)?;
                let (_name, name_len) = read_astring(&view).await?;
                offset += name_len;

                // JOINTDATA (12 bytes)
                offset += JOINTDATA_SIZE;

                // For version < 6, embedded per-joint position + rotation tracks
                // (byte-identical to STCK v1).
                if version < 6 {
                    let position = stck::read_track_v1(data, &mut offset, 3, anim_end).await?;
                    let rotation = stck::read_track_v1(data, &mut offset, 4, anim_end).await?;
                    bone_tracks.push(stck::BoneTrack {
                        bone_id: i as i32,
                        position,
                        rotation,
                    });
                }
            }
        }

        // Parse hooks
        let mut hooks = Vec::with_capacity(num_hooks);
        for _ in 0..num_hooks {
            let view = data.get(offset..)?;
            let (name, name_len) = read_astring(&view).await?;
            offset += name_len;

            let hd = data.get(offset..offset + HOOKDATA_SIZE)?;
            let hook_type = hd.get(0..4)?.as_le::<u32>().await?;
            let bone_index = hd.get(4..8)?.as_le::<i32>().await?;
            let transform = read_matrix(&hd.get(8..72)?).await?;
            offset += HOOKDATA_SIZE;

            hooks.push(Hook {
                name,
                hook_type,
                bone_index,
                transform,
            });
        }

        let embedded_animation = if version < 6 && num_joints > 0 {
            Some(stck::Animation {
                anim_start,
                anim_end: Some(anim_end),
                anim_fps,
                bone_tracks,
            })
        } else {
            None
        };

        Ok(Skeleton {
            version,
            bones,
            hooks,
            embedded_animation,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::include_test_data_bytes;

    #[test]
    fn parse_carnivore_plant_bon() {
        let bytes = include_test_data_bytes!("models/carnivore_plant/花苞食人花_b.bon");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let skel = pollster::block_on(Skeleton::parse(&ds)).unwrap();
        assert_eq!(skel.version, 5);
        assert_eq!(skel.bones.len(), 26);
        assert_eq!(skel.hooks.len(), 3);
        assert_eq!(skel.bones[0].parent, -1);
    }

    #[test]
    fn parse_carnivore_plant_bon_header_animation() {
        let bytes = include_test_data_bytes!("models/carnivore_plant/花苞食人花_b.bon");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let skel = pollster::block_on(Skeleton::parse(&ds)).unwrap();
        let anim = skel
            .embedded_animation
            .as_ref()
            .expect("embedded animation");
        assert_eq!(anim.anim_start, 0);
        assert_eq!(anim.anim_end, Some(407));
        assert_eq!(anim.anim_fps, 15);
    }

    #[test]
    fn parse_carnivore_plant_bon_embedded_tracks() {
        let bytes = include_test_data_bytes!("models/carnivore_plant/花苞食人花_b.bon");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let skel = pollster::block_on(Skeleton::parse(&ds)).unwrap();
        let anim = skel
            .embedded_animation
            .as_ref()
            .expect("embedded animation");
        assert_eq!(anim.bone_tracks.len(), 26);
        let bt0 = &anim.bone_tracks[0];
        assert_eq!(bt0.bone_id, 0);
        assert_eq!(bt0.position.frame_rate, 15);
        assert_eq!(bt0.rotation.frame_rate, 15);
        assert_eq!(bt0.position.keys.len() % 3, 0);
        assert_eq!(bt0.rotation.keys.len() % 4, 0);
    }

    #[test]
    fn parse_fallen_general_bon() {
        let bytes = include_test_data_bytes!("models/fallen_general/兵殇将军.bon");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let skel = pollster::block_on(Skeleton::parse(&ds)).unwrap();
        assert_eq!(skel.version, 5);
        assert_eq!(skel.bones.len(), 33);
        assert_eq!(skel.hooks.len(), 5);
    }

    #[test]
    fn reject_bad_magic() {
        let mut buf = vec![0xDE, 0xAD, 0xBE, 0xEF];
        buf.extend_from_slice(&[0u8; 92]);
        let ds = DataSource::from_bytes(buf);
        assert!(pollster::block_on(Skeleton::parse(&ds)).is_err());
    }

    #[test]
    fn reject_truncated() {
        let ds = DataSource::from_bytes(vec![0u8; 10]);
        assert!(pollster::block_on(Skeleton::parse(&ds)).is_err());
    }
}
