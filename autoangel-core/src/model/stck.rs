use crate::model::bindable;
use crate::model::common::{detect_moxb_offset, read_count};
use crate::util::data_source::{DataReader, DataSource};
use eyre::Result;
use macro_rules_attribute::apply;

const MAGIC: u32 = 0x5354434B; // "STCK"

/// An animation parsed from a STCK file or BON v<6 embedded animation block.
#[apply(bindable)]
pub struct Animation {
    pub anim_start: i32,
    pub anim_end: Option<i32>,
    pub anim_fps: i32,
    pub bone_tracks: Vec<BoneTrack>,
}

/// Per-bone animation track data.
#[apply(bindable)]
pub struct BoneTrack {
    pub bone_id: i32,
    pub position: Track,
    pub rotation: Track,
}

/// A single animation track (position or rotation keyframes).
#[apply(bindable)]
pub struct Track {
    pub frame_rate: i32,
    pub track_length_ms: i32,
    /// Flat keyframe data: 3 floats per key (position) or 4 floats per key (rotation).
    pub keys: Vec<f32>,
    /// Per-key frame IDs; `None` for V1 files.
    pub key_frame_ids: Option<Vec<u16>>,
}

impl Animation {
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

        Ok(Animation {
            anim_start,
            anim_end: Some(anim_end),
            anim_fps,
            bone_tracks,
        })
    }
}

/// Raw segment record from V1 / BON-embedded track data.
/// Used internally to derive `key_frame_ids` so sparse tracks play with correct timing.
struct Segment {
    start_time: i32,
    start_key: i32,
    end_key: i32,
}

/// Derive per-key frame indices from V1 segment records.
///
/// Engine reference (`A3DTrackData::GetFloorKeyIndex_OV`):
/// ```text
/// iKey = pSegment->iStartKey + (nAbsTime - pSegment->iStartTime) * m_nFrameRate / 1000;
/// ```
/// So within a segment, keys advance one step per `1000 / frame_rate` ms, anchored at
/// `iStartTime` for index `iStartKey`. This gives:
/// ```text
/// time_ms(K) = segment.start_time + (K - segment.start_key) * 1000 / frame_rate
/// base_frame = round((segment.start_time * frame_rate) / 1000)
/// key_frame_ids[K] = base_frame + (K - segment.start_key)   // for K in [start_key, end_key]
/// ```
///
/// Caller must gate on `frame_rate > 0`; this body assumes that.
fn derive_frame_ids(segments: &[Segment], num_keys: usize, frame_rate: i32) -> Result<Vec<u16>> {
    debug_assert!(frame_rate > 0, "derive_frame_ids requires frame_rate > 0");
    let mut ids = vec![0u16; num_keys];
    for seg in segments {
        if seg.start_key < 0 || seg.end_key < seg.start_key {
            continue; // malformed: negative start, or end < start
        }
        // Round-half-up via integer math (i64 to avoid overflow on long timelines):
        // engine's runtime time→key uses truncating divide, but for our key→frame
        // direction the boundary case (e.g. boss seg start_time=66 at 15fps:
        // 0.99 frames) needs rounding to preserve key ordering — floor would
        // collapse adjacent boundary keys to the same frame.
        let base = ((seg.start_time as i64 * frame_rate as i64 + 500) / 1000) as i32;
        let span = seg.end_key - seg.start_key;
        for i in 0..=span {
            let k = (seg.start_key + i) as usize;
            if k >= num_keys {
                continue; // defensive: malformed segment
            }
            let frame = base + i;
            if frame < 0 || frame > u16::MAX as i32 {
                eyre::bail!(
                    "track frame index {frame} out of u16 range (start_time={}, frame_rate={})",
                    seg.start_time,
                    frame_rate
                );
            }
            ids[k] = frame as u16;
        }
    }
    Ok(ids)
}

/// Read a single track (position or rotation) for V1.
/// `floats_per_key` is 3 for position (vec3) or 4 for rotation (quaternion xyzw).
pub(crate) async fn read_track_v1<R: DataReader>(
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

    // Read segment records (4 × i32 = 16 bytes each) and derive per-key frame ids.
    // Layout: start_time, end_time (skipped), start_key, end_key.
    let mut segments = Vec::with_capacity(num_segments);
    for _ in 0..num_segments {
        let view = data.get(*offset..*offset + 16)?;
        segments.push(Segment {
            start_time: view.get(0..4)?.as_le::<i32>().await?,
            start_key: view.get(8..12)?.as_le::<i32>().await?,
            end_key: view.get(12..16)?.as_le::<i32>().await?,
        });
        *offset += 16;
    }

    let key_frame_ids = if !segments.is_empty() && num_keys > 0 && frame_rate > 0 {
        Some(derive_frame_ids(&segments, num_keys, frame_rate)?)
    } else {
        None
    };

    Ok(Track {
        frame_rate,
        track_length_ms,
        keys,
        key_frame_ids,
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
        let ts = pollster::block_on(Animation::parse(&ds)).unwrap();
        assert_eq!(ts.anim_fps, 15);
        assert_eq!(ts.bone_tracks.len(), 1);
        assert_eq!(ts.bone_tracks[0].position.keys.len(), 3); // 1 key × 3 floats
        assert_eq!(ts.bone_tracks[0].rotation.keys.len(), 4); // 1 key × 4 floats
        // Static tracks still have at least one segment, so derived ids are Some.
        assert!(ts.bone_tracks[0].position.key_frame_ids.is_some());
    }

    #[test]
    fn parse_v1_animated() {
        let bytes = include_test_data_bytes!("models/stck_v1_animated.stck");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let ts = pollster::block_on(Animation::parse(&ds)).unwrap();
        assert_eq!(ts.anim_fps, 15);
        assert_eq!(ts.anim_end, Some(70));
        assert_eq!(ts.bone_tracks.len(), 5);
        // bone 0 has 1 key each; bone 1 has 71 position keys (71×3 floats) and 1 rotation key
        assert!(ts.bone_tracks[1].position.keys.len() > 3);
        assert!(ts.bone_tracks[2].rotation.keys.len() > 4);
    }

    #[test]
    fn parse_v1_animated_key_frame_ids_populated() {
        let bytes = include_test_data_bytes!("models/stck_v1_animated.stck");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let ts = pollster::block_on(Animation::parse(&ds)).unwrap();
        // Find a non-static track (>1 key) — those have segments worth deriving from.
        let animated = ts
            .bone_tracks
            .iter()
            .find(|bt| bt.position.keys.len() > 3)
            .or_else(|| ts.bone_tracks.iter().find(|bt| bt.rotation.keys.len() > 4))
            .expect("at least one non-static track in fixture");
        let chosen = if animated.position.keys.len() > 3 {
            &animated.position
        } else {
            &animated.rotation
        };
        let ids = chosen
            .key_frame_ids
            .as_ref()
            .expect("derived key_frame_ids on v1 sparse track");
        assert!(!ids.is_empty());
        assert_eq!(ids[0], 0);
    }

    #[test]
    fn parse_v2_static() {
        let bytes = include_test_data_bytes!("models/stck_v2_static.stck");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let ts = pollster::block_on(Animation::parse(&ds)).unwrap();
        assert_eq!(ts.bone_tracks.len(), 1);
    }

    #[test]
    fn parse_v2_animated() {
        let bytes = include_test_data_bytes!("models/stck_v2_animated.stck");
        let ds = DataSource::from_bytes(bytes.to_vec());
        let ts = pollster::block_on(Animation::parse(&ds)).unwrap();
        assert_eq!(ts.anim_fps, 30);
        assert_eq!(ts.anim_end, Some(100));
        assert_eq!(ts.bone_tracks.len(), 25);
        // Rotation keys should be full quaternions (4 floats each) after no-w decompression
        assert_eq!(ts.bone_tracks[0].rotation.keys.len() % 4, 0);
    }

    #[test]
    fn reject_bad_magic() {
        let mut buf = vec![0xDE, 0xAD, 0xBE, 0xEF];
        buf.extend_from_slice(&[0u8; 20]);
        let ds = DataSource::from_bytes(buf);
        assert!(pollster::block_on(Animation::parse(&ds)).is_err());
    }

    #[test]
    fn reject_truncated() {
        let ds = DataSource::from_bytes(vec![0u8; 10]);
        assert!(pollster::block_on(Animation::parse(&ds)).is_err());
    }
}
