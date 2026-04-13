use crate::model::common::{detect_moxb_offset, read_count};
use crate::util::data_source::{DataReader, DataSource};
use eyre::Result;

const MAGIC: u32 = 0x5354434B; // "STCK"

/// An animation track set parsed from a STCK file.
#[derive(Debug, Clone)]
pub struct TrackSet {
    pub version: u32,
    pub anim_start: i32,
    pub anim_end: i32,
    pub anim_fps: i32,
    pub bone_tracks: Vec<BoneTrack>,
}

/// Per-bone animation track data.
#[derive(Debug, Clone)]
pub struct BoneTrack {
    pub bone_id: i32,
    pub position: Track,
    pub rotation: Track,
}

/// A single animation track (position or rotation keyframes).
#[derive(Debug, Clone)]
pub struct Track {
    pub frame_rate: i32,
    pub track_length_ms: i32,
    /// Flat keyframe data: 3 floats per key (position) or 4 floats per key (rotation).
    pub keys: Vec<f32>,
    /// Per-key frame IDs; `None` for V1 files.
    pub key_frame_ids: Option<Vec<u16>>,
}

impl TrackSet {
    pub async fn parse<R: DataReader>(data: &DataSource<R>) -> Result<Self> {
        let moxb = detect_moxb_offset(data).await?;

        // Minimum size: magic(4) + version(4) + header(16) = 24 bytes after moxb
        if data.size() < moxb + 24 {
            eyre::bail!("STCK file too small: {} bytes", data.size());
        }

        let magic = data.get(moxb..moxb + 4)?.as_le::<u32>().await?;
        if magic != MAGIC {
            eyre::bail!("Invalid STCK magic: {magic:08X}, expected {MAGIC:08X}");
        }

        let version = data.get(moxb + 4..moxb + 8)?.as_le::<u32>().await?;
        if version != 1 && version != 2 {
            eyre::bail!("Unsupported STCK version: {version}");
        }

        let num_bone_tracks = read_count(data, moxb + 8).await?;
        let anim_start = data.get(moxb + 12..moxb + 16)?.as_le::<i32>().await?;
        let anim_end = data.get(moxb + 16..moxb + 20)?.as_le::<i32>().await?;
        let anim_fps = data.get(moxb + 20..moxb + 24)?.as_le::<i32>().await?;

        let mut offset = moxb + 24;

        let mut bone_tracks = Vec::with_capacity(num_bone_tracks);
        for _ in 0..num_bone_tracks {
            let bone_id = data.get(offset..offset + 4)?.as_le::<i32>().await?;
            offset += 4;

            let (position, rotation) = if version < 2 {
                let position = read_track_v1(data, &mut offset, 3, anim_end).await?;
                let rotation = read_track_v1(data, &mut offset, 4, anim_end).await?;
                (position, rotation)
            } else {
                let position = read_pos_track_v2(data, &mut offset).await?;
                let rotation = read_rot_track_v2(data, &mut offset).await?;
                (position, rotation)
            };

            bone_tracks.push(BoneTrack {
                bone_id,
                position,
                rotation,
            });
        }

        Ok(TrackSet {
            version,
            anim_start,
            anim_end,
            anim_fps,
            bone_tracks,
        })
    }
}

/// Read a single track (position or rotation) for V1.
/// `floats_per_key` is 3 for position (vec3) or 4 for rotation (quaternion xyzw).
async fn read_track_v1<R: DataReader>(
    data: &DataSource<R>,
    offset: &mut u64,
    floats_per_key: usize,
    anim_end: i32,
) -> Result<Track> {
    let num_keys = read_count(data, *offset).await?;
    let num_segments = read_count(data, *offset + 4).await?;
    let frame_rate = data.get(*offset + 8..*offset + 12)?.as_le::<i32>().await?;
    *offset += 12; // track info header

    let track_length_ms = if frame_rate > 0 {
        anim_end * 1000 / frame_rate
    } else {
        0
    };

    // Read flat keyframe data
    let total_floats = num_keys * floats_per_key;
    let mut keys = Vec::with_capacity(total_floats);
    for _ in 0..total_floats {
        keys.push(data.get(*offset..*offset + 4)?.as_le::<f32>().await?);
        *offset += 4;
    }

    // Skip segments (4 × i32 = 16 bytes each, read and discarded)
    *offset += num_segments as u64 * 16;

    Ok(Track {
        frame_rate,
        track_length_ms,
        keys,
        key_frame_ids: None,
    })
}

/// Read the common V2 track header (A3DTRACKSAVEDATA). Segments are an
/// optimization for time-range queries and not needed for playback.
async fn read_track_v2_header<R: DataReader>(
    data: &DataSource<R>,
    offset: &mut u64,
) -> Result<(usize, i32)> {
    let num_keys = read_count(data, *offset).await?;
    let _num_segments = read_count(data, *offset + 4).await?; // skip: not needed for playback
    let frame_rate = data.get(*offset + 8..*offset + 12)?.as_le::<i32>().await?;
    *offset += 12;
    Ok((num_keys, frame_rate))
}

/// Read the common V2 tail: track_length_ms, compression_algorithm, optional key_frame_ids.
async fn read_track_v2_tail<R: DataReader>(
    data: &DataSource<R>,
    offset: &mut u64,
    num_keys: usize,
) -> Result<(i32, Option<Vec<u16>>)> {
    let track_length_ms = data.get(*offset..*offset + 4)?.as_le::<i32>().await?;
    *offset += 4;

    let compression_algorithm = data.get(*offset..*offset + 4)?.as_le::<i32>().await?;
    *offset += 4;

    let key_frame_ids = if compression_algorithm != 0 {
        let mut ids = Vec::with_capacity(num_keys);
        for _ in 0..num_keys {
            ids.push(data.get(*offset..*offset + 2)?.as_le::<u16>().await?);
            *offset += 2;
        }
        Some(ids)
    } else {
        None
    };

    Ok((track_length_ms, key_frame_ids))
}

/// Read a V2 position track (always 3 floats per key).
async fn read_pos_track_v2<R: DataReader>(data: &DataSource<R>, offset: &mut u64) -> Result<Track> {
    let (num_keys, frame_rate) = read_track_v2_header(data, offset).await?;

    let total_floats = num_keys * 3;
    let mut keys = Vec::with_capacity(total_floats);
    for _ in 0..total_floats {
        keys.push(data.get(*offset..*offset + 4)?.as_le::<f32>().await?);
        *offset += 4;
    }

    let (track_length_ms, key_frame_ids) = read_track_v2_tail(data, offset, num_keys).await?;

    Ok(Track {
        frame_rate,
        track_length_ms,
        keys,
        key_frame_ids,
    })
}

/// Read a V2 rotation track. Reads quat_compression_format before keys; if no-w,
/// reads 3 floats per key and reconstructs w = sqrt(max(0, 1 - x² - y² - z²)).
async fn read_rot_track_v2<R: DataReader>(data: &DataSource<R>, offset: &mut u64) -> Result<Track> {
    let (num_keys, frame_rate) = read_track_v2_header(data, offset).await?;

    // quat_compression_format: 0 = full 4×f32, 1 = no_w 3×f32
    let quat_comp_fmt = data.get(*offset..*offset + 4)?.as_le::<i32>().await?;
    *offset += 4;

    let keys = if quat_comp_fmt == 1 {
        // no-w: read xyz, reconstruct w
        let mut keys = Vec::with_capacity(num_keys * 4);
        for _ in 0..num_keys {
            let x = data.get(*offset..*offset + 4)?.as_le::<f32>().await?;
            *offset += 4;
            let y = data.get(*offset..*offset + 4)?.as_le::<f32>().await?;
            *offset += 4;
            let z = data.get(*offset..*offset + 4)?.as_le::<f32>().await?;
            *offset += 4;
            let s = 1.0_f32 - x * x - y * y - z * z;
            let w = if s > 0.0 { s.sqrt() } else { 0.0 };
            keys.push(x);
            keys.push(y);
            keys.push(z);
            keys.push(w);
        }
        keys
    } else {
        // full quaternion: read xyzw
        let total_floats = num_keys * 4;
        let mut keys = Vec::with_capacity(total_floats);
        for _ in 0..total_floats {
            keys.push(data.get(*offset..*offset + 4)?.as_le::<f32>().await?);
            *offset += 4;
        }
        keys
    };

    let (track_length_ms, key_frame_ids) = read_track_v2_tail(data, offset, num_keys).await?;

    Ok(Track {
        frame_rate,
        track_length_ms,
        keys,
        key_frame_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::include_test_data_bytes;

    #[test]
    fn parse_v1_static() {
        let bytes = include_test_data_bytes!("models/stck_v1_static.stck");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let ts = pollster::block_on(TrackSet::parse(&ds)).unwrap();
        assert_eq!(ts.version, 1);
        assert_eq!(ts.anim_fps, 15);
        assert_eq!(ts.bone_tracks.len(), 1);
        assert_eq!(ts.bone_tracks[0].position.keys.len(), 3); // 1 key × 3 floats
        assert_eq!(ts.bone_tracks[0].rotation.keys.len(), 4); // 1 key × 4 floats
        assert!(ts.bone_tracks[0].position.key_frame_ids.is_none());
    }

    #[test]
    fn parse_v1_animated() {
        let bytes = include_test_data_bytes!("models/stck_v1_animated.stck");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let ts = pollster::block_on(TrackSet::parse(&ds)).unwrap();
        assert_eq!(ts.version, 1);
        assert_eq!(ts.anim_fps, 15);
        assert_eq!(ts.anim_end, 70);
        assert_eq!(ts.bone_tracks.len(), 5);
        // bone 0 has 1 key each; bone 1 has 71 position keys (71×3 floats) and 1 rotation key
        assert!(ts.bone_tracks[1].position.keys.len() > 3);
        assert!(ts.bone_tracks[2].rotation.keys.len() > 4);
    }

    #[test]
    fn parse_v2_static() {
        let bytes = include_test_data_bytes!("models/stck_v2_static.stck");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let ts = pollster::block_on(TrackSet::parse(&ds)).unwrap();
        assert_eq!(ts.version, 2);
        assert_eq!(ts.bone_tracks.len(), 1);
    }

    #[test]
    fn parse_v2_animated() {
        let bytes = include_test_data_bytes!("models/stck_v2_animated.stck");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let ts = pollster::block_on(TrackSet::parse(&ds)).unwrap();
        assert_eq!(ts.version, 2);
        assert_eq!(ts.anim_fps, 30);
        assert_eq!(ts.anim_end, 100);
        assert_eq!(ts.bone_tracks.len(), 25);
        // Rotation keys should be full quaternions (4 floats each) after no-w decompression
        assert_eq!(ts.bone_tracks[0].rotation.keys.len() % 4, 0);
    }

    #[test]
    fn reject_bad_magic() {
        let mut buf = vec![0xDE, 0xAD, 0xBE, 0xEF];
        buf.extend_from_slice(&[0u8; 20]);
        let ds = DataSource::from_bytes(buf);
        assert!(pollster::block_on(TrackSet::parse(&ds)).is_err());
    }

    #[test]
    fn reject_truncated() {
        let ds = DataSource::from_bytes(vec![0u8; 10]);
        assert!(pollster::block_on(TrackSet::parse(&ds)).is_err());
    }
}
