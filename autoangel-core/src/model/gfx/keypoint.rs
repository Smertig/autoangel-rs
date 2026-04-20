use super::NoiseCtrl;
use super::{checked_count, parse_noise_ctrl, read_u32_dec};
use crate::model::bindable;
use crate::model::text_reader::Lines;
use eyre::{Result, eyre};
use macro_rules_attribute::apply;

/// Animation keypoint set for a GFX element — the list of keyframes whose
/// transform changes over time. Mirrors `A3DGFXKeyPointSet::Load`.
#[apply(bindable)]
pub struct KeyPointSet {
    pub start_time: i32,
    pub keypoints: Vec<KeyPoint>,
}

/// One animation keyframe — transform snapshot plus any per-frame
/// controller overlays.
#[apply(bindable)]
pub struct KeyPoint {
    /// Interpolation between this keypoint and the next:
    /// 0 = nearest, 1 = linear, 2 = spline.
    pub interpolate_mode: i32,
    /// Delta ms from the previous keypoint. `-1` = hold forever.
    pub time_span: i32,
    pub position: [f32; 3],
    /// ARGB color packed as `i32` on disk; surfaced as `u32`.
    pub color: u32,
    pub scale: f32,
    /// XYZW quaternion.
    pub direction: [f32; 4],
    pub rad_2d: f32,
    pub controllers: Vec<KpController>,
}

/// Single keypoint controller — same wire format as a particle affector.
/// Version ≥21 adds `start_time`/`end_time` normalized timestamps.
#[apply(bindable)]
pub struct KpController {
    pub start_time: Option<f32>,
    pub end_time: Option<f32>,
    pub body: KpCtrlBody,
}

/// Typed controller body. CtrlTypes and field layouts mirror
/// `A3DGFXKeyPoint.cpp`'s `CreateKPCtrl` dispatch and the corresponding
/// `Ctrl*::Load` methods.
#[apply(bindable)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum KpCtrlBody {
    /// Type 100 — linear translation.
    Move { dir: [f32; 3], vel: f32, acc: f32 },
    /// Type 101 — 2D rotation around origin.
    Rot { vel: f32, acc: f32 },
    /// Type 102 — rotation around arbitrary axis.
    RotAxis {
        pos: [f32; 3],
        axis: [f32; 3],
        vel: f32,
        acc: f32,
    },
    /// Type 103 — revolution (orbit around an axis).
    Revol {
        pos: [f32; 3],
        axis: [f32; 3],
        vel: f32,
        acc: f32,
    },
    /// Type 104 — centripetal force toward a point.
    CentriMove {
        center: [f32; 3],
        vel: f32,
        acc: f32,
    },
    /// Type 105 — signed ARGB deltas per second.
    Color { color_delta: [i32; 4] },
    /// Type 106 — scale delta with min/max clamp.
    /// Engine key: `ScaleChage` (typo preserved).
    Scale {
        scale_delta: f32,
        min_scale: f32,
        max_scale: f32,
    },
    /// Type 107 — color noise overlay (NoiseBase fields + BaseColor).
    ClNoise { noise: NoiseCtrl, base_color: u32 },
    /// Type 108 — color transition track.
    /// `dest_colors` and `trans_times_ms` have equal length = `Count`.
    /// v<11 has an implicit `Count = 1`; v<12 `trans_times_ms` is `ms * 1000`
    /// (pre-float-timespan format); v>=81 emits `AlphaOnly`.
    ClTrans {
        color_origin: u32,
        dest_colors: Vec<u32>,
        trans_times_ms: Vec<f32>,
        alpha_only: Option<bool>,
    },
    /// Type 109 — scale noise overlay.
    ScaNoise { noise: NoiseCtrl },
    /// Type 110 — movement along a cubic-bezier curve.
    /// v>=44 adds `CalcDir`. `vertices.len()` = `Count`.
    CurveMove {
        calc_dir: Option<bool>,
        vertices: Vec<[f32; 3]>,
    },
    /// Type 111 — scale transition track.
    ScaleTrans {
        scale_origin: f32,
        dest_scales: Vec<f32>,
        trans_times_ms: Vec<f32>,
    },
    /// Type 112 — base Perlin-like noise controller.
    NoiseBase { noise: NoiseCtrl },
    /// CtrlType not in `CreateKPCtrl` — e.g. 113 seen in a handful of
    /// real files. Engine itself rejects these; we preserve for
    /// forward-compat inspection.
    Unknown {
        ctrl_type: i32,
        raw_lines: Vec<String>,
    },
}

// =====  KeyPointSet  =====
//
// Outer readers that compose per-keypoint controllers into the full
// animation keypoint set. Mirrors `A3DGFXKeyPointSet::Load` and
// `A3DGFXKeyPoint::Load`.

/// Non-binary branch of `A3DGFXKeyPoint::Load`
/// (`A3DGFXKeyPoint.cpp:115-171`). Reads a single keyframe: interpolation
/// mode, time span, transform (position / color / scale / direction /
/// rad_2d), and any per-keypoint inner controllers.
fn parse_key_point(r: &mut Lines<'_>, version: u32) -> Result<KeyPoint> {
    let interpolate_mode = r.read::<i32>("InterpolateMode")?;
    let time_span = r.read::<i32>("TimeSpan")?;
    let position = r.read::<[f32; 3]>("Position")?;
    let color = read_u32_dec(r, "Color")?;
    let scale = r.read::<f32>("Scale")?;
    let direction = r.read::<[f32; 4]>("Direction")?;
    let rad_2d = r.read::<f32>("Rad_2D")?;
    let ctrl_count = checked_count(r.read::<i32>("CtrlMethodCount")?, "CtrlMethodCount")?;
    let mut controllers = Vec::with_capacity(ctrl_count);
    for _ in 0..ctrl_count {
        controllers.push(parse_controller(r, version)?);
    }
    Ok(KeyPoint {
        interpolate_mode,
        time_span,
        position,
        color,
        scale,
        direction,
        rad_2d,
        controllers,
    })
}

/// Non-binary branch of `A3DGFXKeyPointSet::Load`
/// (`A3DGFXKeyPoint.cpp:1500-1533`). Reads the set-level `StartTime`
/// plus `KEYPOINTCOUNT` keypoints.
pub(super) fn parse_key_point_set(r: &mut Lines<'_>, version: u32) -> Result<KeyPointSet> {
    let start_time = r.read::<i32>("StartTime")?;
    let kp_count = checked_count(r.read::<i32>("KEYPOINTCOUNT")?, "KEYPOINTCOUNT")?;
    let mut keypoints = Vec::with_capacity(kp_count);
    for _ in 0..kp_count {
        keypoints.push(parse_key_point(r, version)?);
    }
    Ok(KeyPointSet {
        start_time,
        keypoints,
    })
}

/// Particle affector list: `AffectorCount: N` + N × `parse_controller`.
/// Mirrors the tail of `A3DParticleSystemEx::Load`.
pub(super) fn parse_affector_list(r: &mut Lines<'_>, version: u32) -> Result<Vec<KpController>> {
    let count = checked_count(r.read::<i32>("AffectorCount")?, "AffectorCount")?;
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        out.push(parse_controller(r, version)?);
    }
    Ok(out)
}

// ===== KeyPointSet controllers =====
//
// Per-controller body parsers. Each mirrors the non-binary branch of the
// corresponding `A3DGFXCtrl*::Load`.

/// CtrlType 100 — linear translation.
/// Ref: `A3DGFXKeyPoint.cpp:317-342` (`A3DGFXCtrlMove::Load`).
fn parse_ctrl_move_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    Ok(KpCtrlBody::Move {
        dir: r.read::<[f32; 3]>("Dir")?,
        vel: r.read::<f32>("Vel")?,
        acc: r.read::<f32>("Acc")?,
    })
}

/// CtrlType 101 — 2D rotation around origin.
/// Ref: `A3DGFXKeyPoint.cpp:374-395` (`A3DGFXCtrlRot::Load`).
fn parse_ctrl_rot_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    Ok(KpCtrlBody::Rot {
        vel: r.read::<f32>("Vel")?,
        acc: r.read::<f32>("Acc")?,
    })
}

/// CtrlType 102 — rotation around arbitrary axis.
/// Ref: `A3DGFXKeyPoint.cpp:441-470` (`A3DGFXCtrlRotAxis::Load`).
fn parse_ctrl_rot_axis_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    Ok(KpCtrlBody::RotAxis {
        pos: r.read::<[f32; 3]>("Pos")?,
        axis: r.read::<[f32; 3]>("Axis")?,
        vel: r.read::<f32>("Vel")?,
        acc: r.read::<f32>("Acc")?,
    })
}

/// CtrlType 103 — revolution (orbit around an axis).
/// Ref: `A3DGFXKeyPoint.cpp:514-543` (`A3DGFXCtrlRevol::Load`).
/// Same wire layout as RotAxis but yields a distinct variant.
fn parse_ctrl_revol_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    Ok(KpCtrlBody::Revol {
        pos: r.read::<[f32; 3]>("Pos")?,
        axis: r.read::<[f32; 3]>("Axis")?,
        vel: r.read::<f32>("Vel")?,
        acc: r.read::<f32>("Acc")?,
    })
}

/// CtrlType 104 — centripetal force toward a point.
/// Ref: `A3DGFXKeyPoint.cpp:587-612` (`A3DGFXCtrlCentriMove::Load`).
/// Engine field `Pos` is exposed here as `center` (matches the
/// engine's `m_vCentPos` member).
fn parse_ctrl_centri_move_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    Ok(KpCtrlBody::CentriMove {
        center: r.read::<[f32; 3]>("Pos")?,
        vel: r.read::<f32>("Vel")?,
        acc: r.read::<f32>("Acc")?,
    })
}

/// Read a single line whose value is four comma-separated signed ints,
/// matching the engine's `sscanf("%d, %d, %d, %d")` — spaces are optional,
/// commas are mandatory.
fn read_i32_quad(r: &mut Lines<'_>, key: &str) -> Result<[i32; 4]> {
    let v = r.read_value(key)?;
    let parts: Vec<&str> = v.split(',').map(str::trim).collect();
    if parts.len() != 4 {
        eyre::bail!("{}: expected 4 ints, got '{}'", key, v);
    }
    let parse = |s: &str| -> Result<i32> {
        s.parse::<i32>()
            .map_err(|_| eyre!("{}: invalid int '{}'", key, s))
    };
    Ok([
        parse(parts[0])?,
        parse(parts[1])?,
        parse(parts[2])?,
        parse(parts[3])?,
    ])
}

/// CtrlType 105 — signed ARGB deltas per second.
/// Ref: `A3DGFXKeyPoint.cpp:672-695` (`A3DGFXCtrlColorChange::Load`).
fn parse_ctrl_color_change_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    Ok(KpCtrlBody::Color {
        color_delta: read_i32_quad(r, "ColorDelta")?,
    })
}

/// CtrlType 106 — scale delta with min/max clamp.
/// Ref: `A3DGFXKeyPoint.cpp:1001-1020` (`A3DGFXCtrlScaleChange::Load`).
/// Engine key spelling `ScaleChage` is a typo in the engine source;
/// preserving it verbatim is required for wire-format compatibility.
fn parse_ctrl_scale_change_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    let v = r.read_value("ScaleChage")?; // engine typo — intentional
    let parts: Vec<&str> = v.split(',').map(str::trim).collect();
    if parts.len() != 3 {
        eyre::bail!("ScaleChage: expected 3 floats, got '{}'", v);
    }
    let parse = |s: &str| -> Result<f32> {
        s.parse::<f32>()
            .map_err(|_| eyre!("ScaleChage: invalid float '{}'", s))
    };
    Ok(KpCtrlBody::Scale {
        scale_delta: parse(parts[0])?,
        min_scale: parse(parts[1])?,
        max_scale: parse(parts[2])?,
    })
}

/// CtrlType 112 — base Perlin-noise controller.
/// Ref: `A3DGFXKeyPoint.cpp:1056-1089` (`A3DGFXCtrlNoiseBase::Load`).
fn parse_ctrl_noise_base_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    Ok(KpCtrlBody::NoiseBase {
        noise: parse_noise_ctrl(r)?,
    })
}

/// CtrlType 107 — color noise overlay (NoiseBase prefix + BaseColor).
/// Ref: `A3DGFXKeyPoint.cpp:1131-1150` (`A3DGFXCtrlColorNoise::Load`).
fn parse_ctrl_color_noise_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    Ok(KpCtrlBody::ClNoise {
        noise: parse_noise_ctrl(r)?,
        base_color: read_u32_dec(r, "BaseColor")?,
    })
}

/// CtrlType 108 — color transition track.
/// Ref: `A3DGFXKeyPoint.cpp:782-853` (`A3DGFXCtrlClTrans::Load`).
///
/// Three version paths:
/// - `version < 11` — implicit `Count = 1`; `TimeSpan` is integer ms and the
///   engine multiplies by `1000.0` to obtain the stored float trans time.
/// - `11 <= version < 12` — explicit `Count: N`, and `TimeSpan` is integer
///   (cast to float *without* the ×1000 multiplier — see C++ line 835).
/// - `version >= 12` — explicit `Count: N`, `TimeSpan` is float.
/// - `version >= 81` adds a trailing `AlphaOnly: %d` line.
fn parse_ctrl_cl_trans_body(r: &mut Lines<'_>, version: u32) -> Result<KpCtrlBody> {
    let color_origin = read_u32_dec(r, "Color")?;

    let (dest_colors, trans_times_ms) = if version < 11 {
        let dest = read_u32_dec(r, "Color")?;
        let t = r.read::<i32>("TimeSpan")?;
        (vec![dest], vec![(t as f32) * 1000.0])
    } else {
        let count = checked_count(r.read::<i32>("Count")?, "ClTrans Count")?;
        let mut dests = Vec::with_capacity(count);
        let mut times = Vec::with_capacity(count);
        for _ in 0..count {
            dests.push(read_u32_dec(r, "Color")?);
            let t = if version < 12 {
                r.read::<i32>("TimeSpan")? as f32
            } else {
                r.read::<f32>("TimeSpan")?
            };
            times.push(t);
        }
        (dests, times)
    };

    let alpha_only = r.read_if::<bool>(version >= 81, "AlphaOnly")?;

    Ok(KpCtrlBody::ClTrans {
        color_origin,
        dest_colors,
        trans_times_ms,
        alpha_only,
    })
}

/// CtrlType 111 — scale transition track.
/// Ref: `A3DGFXKeyPoint.cpp:933-970` (`A3DGFXCtrlScaleTrans::Load`).
///
/// No version gates: always `Scale` (origin) + `Count: N` + N × (`Scale`
/// dest + `TimeSpan` float).
fn parse_ctrl_scale_trans_body(r: &mut Lines<'_>) -> Result<KpCtrlBody> {
    let scale_origin = r.read::<f32>("Scale")?;
    let count = checked_count(r.read::<i32>("Count")?, "ScaleTrans Count")?;
    let mut dests = Vec::with_capacity(count);
    let mut times = Vec::with_capacity(count);
    for _ in 0..count {
        dests.push(r.read::<f32>("Scale")?);
        times.push(r.read::<f32>("TimeSpan")?);
    }
    Ok(KpCtrlBody::ScaleTrans {
        scale_origin,
        dest_scales: dests,
        trans_times_ms: times,
    })
}

/// CtrlType 110 — movement along a cubic-bezier curve.
/// Ref: `A3DGFXKeyPoint.cpp:1227-1269` (`A3DGFXCtrlCurveMove::Load`).
///
/// `version >= 44` prefixes the body with a `CalcDir: %d` line; then
/// `Count: N` + N × `Pos: x, y, z`. The engine's `GenPath` post-step is
/// purely runtime and not persisted.
fn parse_ctrl_curve_move_body(r: &mut Lines<'_>, version: u32) -> Result<KpCtrlBody> {
    let calc_dir = r.read_if::<bool>(version >= 44, "CalcDir")?;
    let count = checked_count(r.read::<i32>("Count")?, "CurveMove Count")?;
    let mut vertices = Vec::with_capacity(count);
    for _ in 0..count {
        vertices.push(r.read::<[f32; 3]>("Pos")?);
    }
    Ok(KpCtrlBody::CurveMove { calc_dir, vertices })
}

/// CtrlType 109 — scale noise overlay (NoiseBase prefix, legacy extra line
/// silently discarded when `version < 13`).
/// Ref: `A3DGFXKeyPoint.cpp:1161-1173` (`A3DGFXCtrlScaleNoise::Load`).
fn parse_ctrl_scale_noise_body(r: &mut Lines<'_>, version: u32) -> Result<KpCtrlBody> {
    let noise = parse_noise_ctrl(r)?;
    if version < 13 {
        // Engine reads and discards one extra line (no `sscanf`); we mirror
        // that by advancing the cursor without interpreting the content.
        r.next_line()?;
    }
    Ok(KpCtrlBody::ScaNoise { noise })
}

/// Shared controller reader — used for particle affectors and for
/// per-keypoint inner controllers. Mirrors
/// `A3DGFXKeyPointCtrlBase::LoadFromFile`.
fn parse_controller(r: &mut Lines<'_>, version: u32) -> Result<KpController> {
    let ctrl_type = r.read::<i32>("CtrlType")?;
    let start_time = r.read_if::<f32>(version >= 21, "StartTime")?;
    let end_time = r.read_if::<f32>(version >= 21, "EndTime")?;

    let body = match ctrl_type {
        100 => parse_ctrl_move_body(r)?,
        101 => parse_ctrl_rot_body(r)?,
        102 => parse_ctrl_rot_axis_body(r)?,
        103 => parse_ctrl_revol_body(r)?,
        104 => parse_ctrl_centri_move_body(r)?,
        105 => parse_ctrl_color_change_body(r)?,
        106 => parse_ctrl_scale_change_body(r)?,
        107 => parse_ctrl_color_noise_body(r)?,
        108 => parse_ctrl_cl_trans_body(r, version)?,
        109 => parse_ctrl_scale_noise_body(r, version)?,
        110 => parse_ctrl_curve_move_body(r, version)?,
        111 => parse_ctrl_scale_trans_body(r)?,
        112 => parse_ctrl_noise_base_body(r)?,
        _ => KpCtrlBody::Unknown {
            ctrl_type,
            raw_lines: collect_unknown_ctrl_tail(r)?,
        },
    };

    Ok(KpController {
        start_time,
        end_time,
        body,
    })
}

/// Consume lines until we hit a boundary that clearly belongs to the
/// containing context — another `CtrlType:` line (next sibling controller),
/// a `InterpolateMode:` line (next keypoint), `KEYPOINTCOUNT:` / `StartTime:`
/// (keypoint-set header for an adjacent element that lacks an affector
/// list), or `GFXELEMENTID:` (next element) / EOF.
fn collect_unknown_ctrl_tail(r: &mut Lines<'_>) -> Result<Vec<String>> {
    const TERMINATORS: &[&str] = &[
        "CtrlType",
        "InterpolateMode",
        "GFXELEMENTID",
        "KEYPOINTCOUNT",
        "StartTime",
    ];
    let mut out = Vec::new();
    while !r.done() {
        match r.peek_key() {
            Some(k) if TERMINATORS.contains(&k) => break,
            _ => out.push(r.next_line()?.to_string()),
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_lines(body: &str) -> Lines<'_> {
        Lines::new(body)
    }

    #[test]
    fn parse_ctrl_move_body() {
        let input = concat!(
            "Dir: 1.000000, 0.000000, 0.000000\r\n",
            "Vel: 5.000000\r\n",
            "Acc: 0.500000\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_move_body(&mut r).unwrap();
        let KpCtrlBody::Move { dir, vel, acc } = body else {
            panic!("expected Move body");
        };
        assert_eq!(dir, [1.0, 0.0, 0.0]);
        assert!((vel - 5.0).abs() < 1e-6);
        assert!((acc - 0.5).abs() < 1e-6);
    }

    #[test]
    fn parse_ctrl_rot_body() {
        let input = concat!("Vel: 3.141593\r\n", "Acc: -0.250000\r\n");
        let mut r = make_lines(input);
        let body = super::parse_ctrl_rot_body(&mut r).unwrap();
        let KpCtrlBody::Rot { vel, acc } = body else {
            panic!("expected Rot body");
        };
        assert!((vel - 3.141593).abs() < 1e-6);
        assert!((acc - -0.25).abs() < 1e-6);
    }

    #[test]
    fn parse_ctrl_rot_axis_body() {
        let input = concat!(
            "Pos: 0.000000, 1.000000, 2.000000\r\n",
            "Axis: 0.000000, 1.000000, 0.000000\r\n",
            "Vel: 6.283185\r\n",
            "Acc: 0.000000\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_rot_axis_body(&mut r).unwrap();
        let KpCtrlBody::RotAxis {
            pos,
            axis,
            vel,
            acc,
        } = body
        else {
            panic!("expected RotAxis body");
        };
        assert_eq!(pos, [0.0, 1.0, 2.0]);
        assert_eq!(axis, [0.0, 1.0, 0.0]);
        assert!((vel - 6.283185).abs() < 1e-6);
        assert!((acc - 0.0).abs() < 1e-6);
    }

    #[test]
    fn parse_ctrl_revol_body() {
        let input = concat!(
            "Pos: 1.500000, 0.000000, -1.500000\r\n",
            "Axis: 1.000000, 0.000000, 0.000000\r\n",
            "Vel: 1.000000\r\n",
            "Acc: 0.100000\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_revol_body(&mut r).unwrap();
        let KpCtrlBody::Revol {
            pos,
            axis,
            vel,
            acc,
        } = body
        else {
            panic!("expected Revol body");
        };
        assert_eq!(pos, [1.5, 0.0, -1.5]);
        assert_eq!(axis, [1.0, 0.0, 0.0]);
        assert!((vel - 1.0).abs() < 1e-6);
        assert!((acc - 0.1).abs() < 1e-6);
    }

    #[test]
    fn parse_ctrl_centri_move_body() {
        let input = concat!(
            "Pos: 2.000000, 0.000000, 0.000000\r\n",
            "Vel: 4.000000\r\n",
            "Acc: -1.000000\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_centri_move_body(&mut r).unwrap();
        let KpCtrlBody::CentriMove { center, vel, acc } = body else {
            panic!("expected CentriMove body");
        };
        assert_eq!(center, [2.0, 0.0, 0.0]);
        assert!((vel - 4.0).abs() < 1e-6);
        assert!((acc - -1.0).abs() < 1e-6);
    }

    #[test]
    fn parse_ctrl_color_change_body() {
        let input = "ColorDelta: 10, -20, 30, -40\r\n";
        let mut r = make_lines(input);
        let body = super::parse_ctrl_color_change_body(&mut r).unwrap();
        let KpCtrlBody::Color { color_delta } = body else {
            panic!("expected Color body");
        };
        assert_eq!(color_delta, [10, -20, 30, -40]);
    }

    #[test]
    fn parse_ctrl_scale_change_body() {
        // Engine typo 'ScaleChage' preserved on purpose — this is what
        // the engine's sscanf literal expects.
        let input = "ScaleChage: 0.100000, 0.500000, 2.000000\r\n";
        let mut r = make_lines(input);
        let body = super::parse_ctrl_scale_change_body(&mut r).unwrap();
        let KpCtrlBody::Scale {
            scale_delta,
            min_scale,
            max_scale,
        } = body
        else {
            panic!("expected Scale body");
        };
        assert!((scale_delta - 0.1).abs() < 1e-6);
        assert!((min_scale - 0.5).abs() < 1e-6);
        assert!((max_scale - 2.0).abs() < 1e-6);
    }

    #[test]
    fn parse_ctrl_noise_base_body() {
        let input = concat!(
            "BufLen: 256\r\n",
            "Amplitude: 2.000000\r\n",
            "WaveLen: 1\r\n",
            "Persistence: 0.500000\r\n",
            "OctaveNum: 5\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_noise_base_body(&mut r).unwrap();
        let KpCtrlBody::NoiseBase { noise } = body else {
            panic!("expected NoiseBase body");
        };
        assert_eq!(noise.buf_len, 256);
        assert!((noise.amplitude - 2.0).abs() < 1e-6);
        assert_eq!(noise.wave_len, 1);
        assert!((noise.persistence - 0.5).abs() < 1e-6);
        assert_eq!(noise.octave_num, 5);
    }

    #[test]
    fn parse_ctrl_color_noise_body() {
        // 5 NoiseCtrl lines + BaseColor. `-1` exercises the signed-dec
        // reinterpret path in `read_u32_dec` (0xFFFFFFFF).
        let input = concat!(
            "BufLen: 256\r\n",
            "Amplitude: 2.000000\r\n",
            "WaveLen: 1\r\n",
            "Persistence: 0.500000\r\n",
            "OctaveNum: 5\r\n",
            "BaseColor: -1\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_color_noise_body(&mut r).unwrap();
        let KpCtrlBody::ClNoise { noise, base_color } = body else {
            panic!("expected ClNoise body");
        };
        assert_eq!(noise.buf_len, 256);
        assert!((noise.amplitude - 2.0).abs() < 1e-6);
        assert_eq!(noise.wave_len, 1);
        assert!((noise.persistence - 0.5).abs() < 1e-6);
        assert_eq!(noise.octave_num, 5);
        assert_eq!(base_color, 0xFFFFFFFF);
    }

    #[test]
    fn parse_ctrl_scale_noise_body_v58_no_extra() {
        // version >= 13: only the NoiseCtrl prefix is read; cursor lands at EOF.
        let input = concat!(
            "BufLen: 256\r\n",
            "Amplitude: 2.000000\r\n",
            "WaveLen: 1\r\n",
            "Persistence: 0.500000\r\n",
            "OctaveNum: 5\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_scale_noise_body(&mut r, 58).unwrap();
        let KpCtrlBody::ScaNoise { noise } = body else {
            panic!("expected ScaNoise body");
        };
        assert_eq!(noise.buf_len, 256);
        assert!((noise.amplitude - 2.0).abs() < 1e-6);
        assert_eq!(noise.wave_len, 1);
        assert!((noise.persistence - 0.5).abs() < 1e-6);
        assert_eq!(noise.octave_num, 5);
        assert!(r.done(), "cursor should be at EOF after parse");
    }

    #[test]
    fn parse_ctrl_scale_noise_body_v10_consumes_extra() {
        // version < 13: engine silently swallows one extra line after the
        // NoiseCtrl prefix (legacy cruft, no sscanf).
        let input = concat!(
            "BufLen: 256\r\n",
            "Amplitude: 2.000000\r\n",
            "WaveLen: 1\r\n",
            "Persistence: 0.500000\r\n",
            "OctaveNum: 5\r\n",
            "LegacyCruft: whatever\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_scale_noise_body(&mut r, 10).unwrap();
        let KpCtrlBody::ScaNoise { noise } = body else {
            panic!("expected ScaNoise body");
        };
        assert_eq!(noise.octave_num, 5);
        assert!(
            r.done(),
            "legacy extra line should have been consumed (cursor at EOF)"
        );
    }

    #[test]
    fn parse_ctrl_cl_trans_body_v99() {
        // Archive sample with all modern fields active: v>=11 Count path,
        // v>=12 float TimeSpan, v>=81 AlphaOnly. (The physical sample was
        // tagged v58 in the archive but the engine's Save always emits
        // AlphaOnly; its Load only consumes it for v>=81, so we parse at
        // v=99 to exercise the fully-populated branch.)
        let input = concat!(
            "Color: 16777215\r\n",
            "Count: 1\r\n",
            "Color: 1694498815\r\n",
            "TimeSpan: 600.000000\r\n",
            "AlphaOnly: 1\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_cl_trans_body(&mut r, 99).unwrap();
        let KpCtrlBody::ClTrans {
            color_origin,
            dest_colors,
            trans_times_ms,
            alpha_only,
        } = body
        else {
            panic!("expected ClTrans body");
        };
        assert_eq!(color_origin, 16777215);
        assert_eq!(dest_colors, vec![1694498815_u32]);
        assert_eq!(trans_times_ms.len(), 1);
        assert!((trans_times_ms[0] - 600.0).abs() < 1e-6);
        assert_eq!(alpha_only, Some(true));
    }

    #[test]
    fn parse_ctrl_cl_trans_body_v11_no_alpha_only() {
        // v>=11 → Count path; v<12 → TimeSpan is read as i32 and cast to
        // float *without* the ×1000 multiplier. v<81 → no AlphaOnly line.
        let input = concat!(
            "Color: 16777215\r\n",
            "Count: 2\r\n",
            "Color: -1\r\n",
            "TimeSpan: 100\r\n",
            "Color: 0\r\n",
            "TimeSpan: 200\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_cl_trans_body(&mut r, 11).unwrap();
        let KpCtrlBody::ClTrans {
            color_origin,
            dest_colors,
            trans_times_ms,
            alpha_only,
        } = body
        else {
            panic!("expected ClTrans body");
        };
        assert_eq!(color_origin, 16777215);
        assert_eq!(dest_colors, vec![0xFFFFFFFF_u32, 0_u32]);
        assert_eq!(trans_times_ms.len(), 2);
        assert!((trans_times_ms[0] - 100.0).abs() < 1e-6);
        assert!((trans_times_ms[1] - 200.0).abs() < 1e-6);
        assert_eq!(alpha_only, None);
    }

    #[test]
    fn parse_ctrl_cl_trans_body_v10_single_dest() {
        // v<11 → implicit Count=1; integer TimeSpan *is* multiplied by 1000.
        let input = concat!("Color: 16777215\r\n", "Color: -1\r\n", "TimeSpan: 3\r\n",);
        let mut r = make_lines(input);
        let body = super::parse_ctrl_cl_trans_body(&mut r, 10).unwrap();
        let KpCtrlBody::ClTrans {
            color_origin,
            dest_colors,
            trans_times_ms,
            alpha_only,
        } = body
        else {
            panic!("expected ClTrans body");
        };
        assert_eq!(color_origin, 16777215);
        assert_eq!(dest_colors, vec![u32::MAX]);
        assert_eq!(trans_times_ms, vec![3000.0_f32]);
        assert_eq!(alpha_only, None);
    }

    #[test]
    fn parse_ctrl_scale_trans_body() {
        let input = concat!(
            "Scale: 0.500000\r\n",
            "Count: 2\r\n",
            "Scale: 1.000000\r\n",
            "TimeSpan: 300.000000\r\n",
            "Scale: 0.200000\r\n",
            "TimeSpan: 800.000000\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_scale_trans_body(&mut r).unwrap();
        let KpCtrlBody::ScaleTrans {
            scale_origin,
            dest_scales,
            trans_times_ms,
        } = body
        else {
            panic!("expected ScaleTrans body");
        };
        assert!((scale_origin - 0.5).abs() < 1e-6);
        assert_eq!(dest_scales.len(), 2);
        assert!((dest_scales[0] - 1.0).abs() < 1e-6);
        assert!((dest_scales[1] - 0.2).abs() < 1e-6);
        assert_eq!(trans_times_ms.len(), 2);
        assert!((trans_times_ms[0] - 300.0).abs() < 1e-6);
        assert!((trans_times_ms[1] - 800.0).abs() < 1e-6);
    }

    #[test]
    fn parse_ctrl_curve_move_body_v58() {
        // v>=44 → CalcDir line present before Count.
        let input = concat!(
            "CalcDir: 1\r\n",
            "Count: 3\r\n",
            "Pos: 0.000000, 0.000000, 0.000000\r\n",
            "Pos: 1.000000, 2.000000, 3.000000\r\n",
            "Pos: 4.000000, 5.000000, 6.000000\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_curve_move_body(&mut r, 58).unwrap();
        let KpCtrlBody::CurveMove { calc_dir, vertices } = body else {
            panic!("expected CurveMove body");
        };
        assert_eq!(calc_dir, Some(true));
        assert_eq!(vertices.len(), 3);
        assert_eq!(vertices[0], [0.0, 0.0, 0.0]);
        assert_eq!(vertices[1], [1.0, 2.0, 3.0]);
        assert_eq!(vertices[2], [4.0, 5.0, 6.0]);
    }

    #[test]
    fn parse_ctrl_curve_move_body_v40_no_calc_dir() {
        // v<44 → no CalcDir line; parser reads Count directly.
        let input = concat!(
            "Count: 2\r\n",
            "Pos: 0.500000, 0.000000, 0.000000\r\n",
            "Pos: -1.000000, 2.000000, 0.000000\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_ctrl_curve_move_body(&mut r, 40).unwrap();
        let KpCtrlBody::CurveMove { calc_dir, vertices } = body else {
            panic!("expected CurveMove body");
        };
        assert_eq!(calc_dir, None);
        assert_eq!(vertices.len(), 2);
        assert_eq!(vertices[0], [0.5, 0.0, 0.0]);
        assert_eq!(vertices[1], [-1.0, 2.0, 0.0]);
    }

    #[test]
    fn parse_controller_known_with_v21_timestamps() {
        let input = concat!(
            "CtrlType: 101\r\n",
            "StartTime: 0.250000\r\n",
            "EndTime: 0.750000\r\n",
            "Vel: 3.141593\r\n",
            "Acc: 0.000000\r\n",
        );
        let mut r = make_lines(input);
        let c = super::parse_controller(&mut r, 58).unwrap();
        assert_eq!(c.start_time, Some(0.25));
        assert_eq!(c.end_time, Some(0.75));
        let KpCtrlBody::Rot { vel, .. } = c.body else {
            panic!("expected Rot");
        };
        assert!((vel - 3.141593).abs() < 1e-5);
    }

    #[test]
    fn parse_controller_pre_v21_no_timestamps() {
        let input = concat!(
            "CtrlType: 100\r\n",
            "Dir: 1.000000, 0.000000, 0.000000\r\n",
            "Vel: 5.000000\r\n",
            "Acc: 0.500000\r\n",
        );
        let mut r = make_lines(input);
        let c = super::parse_controller(&mut r, 20).unwrap();
        assert_eq!(c.start_time, None);
        assert_eq!(c.end_time, None);
        assert!(matches!(c.body, KpCtrlBody::Move { .. }));
    }

    #[test]
    fn parse_key_point_set_one_keypoint_one_ctrl() {
        let input = concat!(
            "StartTime: 500\r\n",
            "KEYPOINTCOUNT: 1\r\n",
            "InterpolateMode: 0\r\n",
            "TimeSpan: -1\r\n",
            "Position: 0.000000, 0.000000, 0.000000\r\n",
            "Color: -1\r\n",
            "Scale: 1.000000\r\n",
            "Direction: 0.000000, 0.000000, 0.000000, 1.000000\r\n",
            "Rad_2D: 0.000000\r\n",
            "CtrlMethodCount: 1\r\n",
            "CtrlType: 101\r\n",
            "StartTime: 0.000000\r\n",
            "EndTime: -1.000000\r\n",
            "Vel: 3.141593\r\n",
            "Acc: 0.000000\r\n",
        );
        let mut r = make_lines(input);
        let kps = super::parse_key_point_set(&mut r, 58).unwrap();
        assert_eq!(kps.start_time, 500);
        assert_eq!(kps.keypoints.len(), 1);
        let kp = &kps.keypoints[0];
        assert_eq!(kp.interpolate_mode, 0);
        assert_eq!(kp.time_span, -1);
        assert_eq!(kp.position, [0.0, 0.0, 0.0]);
        assert_eq!(kp.color, 0xFFFFFFFF);
        assert!((kp.scale - 1.0).abs() < 1e-6);
        assert_eq!(kp.direction, [0.0, 0.0, 0.0, 1.0]);
        assert_eq!(kp.rad_2d, 0.0);
        assert_eq!(kp.controllers.len(), 1);
        assert!(matches!(kp.controllers[0].body, KpCtrlBody::Rot { .. }));
    }

    #[test]
    fn parse_key_point_set_multiple_keypoints_no_ctrls() {
        let input = concat!(
            "StartTime: 0\r\n",
            "KEYPOINTCOUNT: 2\r\n",
            // keypoint 1
            "InterpolateMode: 1\r\n",
            "TimeSpan: 100\r\n",
            "Position: 0.000000, 0.000000, 0.000000\r\n",
            "Color: -1\r\n",
            "Scale: 1.000000\r\n",
            "Direction: 0.000000, 0.000000, 0.000000, 1.000000\r\n",
            "Rad_2D: 0.000000\r\n",
            "CtrlMethodCount: 0\r\n",
            // keypoint 2
            "InterpolateMode: 1\r\n",
            "TimeSpan: 200\r\n",
            "Position: 1.000000, 2.000000, 3.000000\r\n",
            "Color: 0\r\n",
            "Scale: 2.000000\r\n",
            "Direction: 1.000000, 0.000000, 0.000000, 0.000000\r\n",
            "Rad_2D: 1.570796\r\n",
            "CtrlMethodCount: 0\r\n",
        );
        let mut r = make_lines(input);
        let kps = super::parse_key_point_set(&mut r, 58).unwrap();
        assert_eq!(kps.start_time, 0);
        assert_eq!(kps.keypoints.len(), 2);
        assert_eq!(kps.keypoints[0].time_span, 100);
        assert_eq!(kps.keypoints[1].time_span, 200);
        assert_eq!(kps.keypoints[1].position, [1.0, 2.0, 3.0]);
        assert_eq!(kps.keypoints[1].color, 0);
        assert!(kps.keypoints[0].controllers.is_empty());
        assert!(kps.keypoints[1].controllers.is_empty());
    }

    #[test]
    fn parse_controller_unknown_ctrl_type_collects_raw() {
        let input = concat!(
            "CtrlType: 113\r\n",
            "StartTime: 0.000000\r\n",
            "EndTime: -1.000000\r\n",
            "UnknownField: 42\r\n",
            "AnotherField: 3.14\r\n",
            "CtrlType: 100\r\n", // terminator — next ctrl starts
            "StartTime: 0.000000\r\n",
            "EndTime: 1.000000\r\n",
            "Dir: 0.000000, 0.000000, 1.000000\r\n",
            "Vel: 0.000000\r\n",
            "Acc: 0.000000\r\n",
        );
        let mut r = make_lines(input);
        let c = super::parse_controller(&mut r, 58).unwrap();
        let KpCtrlBody::Unknown {
            ctrl_type,
            raw_lines,
        } = c.body
        else {
            panic!("expected Unknown");
        };
        assert_eq!(ctrl_type, 113);
        assert_eq!(
            raw_lines,
            vec![
                "UnknownField: 42".to_string(),
                "AnotherField: 3.14".to_string()
            ]
        );
        // Subsequent ctrl still parses cleanly — the terminator line
        // (`CtrlType: 100`) must NOT have been consumed.
        let next = super::parse_controller(&mut r, 58).unwrap();
        assert!(matches!(next.body, KpCtrlBody::Move { .. }));
    }

    #[test]
    fn parse_affector_list_empty() {
        let input = "AffectorCount: 0\r\n";
        let mut r = make_lines(input);
        let affectors = super::parse_affector_list(&mut r, 58).unwrap();
        assert!(affectors.is_empty());
        assert!(r.done());
    }

    #[test]
    fn parse_affector_list_two_mixed_ctrls() {
        // Real sample shape from the Mayhem archive: SCALE + CL_TRANS
        // affector pair on a particle element.
        let input = concat!(
            "AffectorCount: 2\r\n",
            "CtrlType: 106\r\n",
            "StartTime: 0.000000\r\n",
            "EndTime: -1.000000\r\n",
            "ScaleChage: 1.000000, 0.010000, 9999.000000\r\n",
            "CtrlType: 108\r\n",
            "StartTime: 0.000000\r\n",
            "EndTime: -1.000000\r\n",
            "Color: 16777215\r\n",
            "Count: 1\r\n",
            "Color: 1694498815\r\n",
            "TimeSpan: 600.000000\r\n",
        );
        let mut r = make_lines(input);
        let affectors = super::parse_affector_list(&mut r, 58).unwrap();
        assert_eq!(affectors.len(), 2);
        assert!(matches!(affectors[0].body, KpCtrlBody::Scale { .. }));
        assert!(matches!(affectors[1].body, KpCtrlBody::ClTrans { .. }));
        // v58 >= 21, so start_time/end_time were consumed
        assert_eq!(affectors[0].start_time, Some(0.0));
        assert_eq!(affectors[0].end_time, Some(-1.0));
    }
}
