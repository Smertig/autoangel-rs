use crate::model::bindable;
use crate::model::common::decode_gbk;
use crate::model::text_reader::{LineValue, Lines};
use eyre::{Result, eyre};
use macro_rules_attribute::apply;

mod keypoint;
pub use keypoint::{KeyPoint, KeyPointSet, KpController, KpCtrlBody};

/// Type identifier for a GFX element.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GfxElementType {
    Decal3D,
    Decal2D,
    DecalBillboard,
    Trail,
    ParticlePoint,
    ParticleBox,
    ParticleMultiplane,
    ParticleEllipsoid,
    ParticleCylinder,
    ParticleCurve,
    Light,
    Ring,
    Lightning,
    LtnBolt,
    LightningEx,
    Model,
    Sound,
    LtnTrail,
    Paraboloid,
    GfxContainer,
    GridDecal3D,
    GridDecal2D,
    PhysEmitter,
    PhysPointEmitter,
    EcModel,
    Ribbon,
    Unknown(u32),
}

impl GfxElementType {
    pub fn from_id(id: u32) -> Self {
        match id {
            100 => Self::Decal3D,
            101 => Self::Decal2D,
            102 => Self::DecalBillboard,
            110 => Self::Trail,
            120 => Self::ParticlePoint,
            121 => Self::ParticleBox,
            122 => Self::ParticleMultiplane,
            123 => Self::ParticleEllipsoid,
            124 => Self::ParticleCylinder,
            125 => Self::ParticleCurve,
            130 => Self::Light,
            140 => Self::Ring,
            150 => Self::Lightning,
            151 => Self::LtnBolt,
            152 => Self::LightningEx,
            160 => Self::Model,
            170 => Self::Sound,
            180 => Self::LtnTrail,
            190 => Self::Paraboloid,
            200 => Self::GfxContainer,
            210 => Self::GridDecal3D,
            211 => Self::GridDecal2D,
            220 => Self::PhysEmitter,
            221 => Self::PhysPointEmitter,
            230 => Self::EcModel,
            240 => Self::Ribbon,
            other => Self::Unknown(other),
        }
    }

    pub fn to_id(&self) -> u32 {
        match self {
            Self::Decal3D => 100,
            Self::Decal2D => 101,
            Self::DecalBillboard => 102,
            Self::Trail => 110,
            Self::ParticlePoint => 120,
            Self::ParticleBox => 121,
            Self::ParticleMultiplane => 122,
            Self::ParticleEllipsoid => 123,
            Self::ParticleCylinder => 124,
            Self::ParticleCurve => 125,
            Self::Light => 130,
            Self::Ring => 140,
            Self::Lightning => 150,
            Self::LtnBolt => 151,
            Self::LightningEx => 152,
            Self::Model => 160,
            Self::Sound => 170,
            Self::LtnTrail => 180,
            Self::Paraboloid => 190,
            Self::GfxContainer => 200,
            Self::GridDecal3D => 210,
            Self::GridDecal2D => 211,
            Self::PhysEmitter => 220,
            Self::PhysPointEmitter => 221,
            Self::EcModel => 230,
            Self::Ribbon => 240,
            Self::Unknown(id) => *id,
        }
    }
}

/// A single visual effect element within a GFX file.
#[apply(bindable)]
pub struct GfxElement {
    /// Numeric element type id, e.g. 100 for Decal3D. Use
    /// `GfxElementType::from_id(type_id)` to recover the typed enum.
    pub type_id: u32,
    pub name: String,
    pub src_blend: i32,
    pub dest_blend: i32,
    pub repeat_count: i32,
    pub repeat_delay: i32,
    pub tex_file: String,
    pub tex_row: i32,
    pub tex_col: i32,
    pub tex_interval: i32,
    pub tile_mode: i32,
    pub z_enable: i32,
    pub is_dummy: i32,
    pub priority: i32,
    /// Typed element-specific body; unparsed types keep their raw lines in
    /// `ElementBody::Unknown`.
    pub body: ElementBody,
}

/// Element-type-specific body data. Each variant holds the parsed
/// fields inline plus any unparsed `tail_lines` (affector blocks +
/// KeyPointSet) relevant to that element type.
#[apply(bindable)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ElementBody {
    /// Element body not structurally parsed — raw lines preserved.
    Unknown { lines: Vec<String> },
    /// 2D/3D/billboard textured quad (types 100 / 101 / 102).
    Decal {
        width: f32,
        height: f32,
        rot_from_view: bool,
        grnd_norm_only: Option<bool>,
        /// Two separate `NoScale:` lines in the file — (width, height).
        no_scale: Option<(bool, bool)>,
        /// Two separate `OrgPt:` lines in the file — (width, height).
        org_pt: Option<(f32, f32)>,
        z_offset: Option<f32>,
        match_surface: Option<bool>,
        surface_use_parent_dir: Option<bool>,
        max_extent: Option<f32>,
        yaw_effect: Option<bool>,
        /// `ScreenSpace: %d` (v>=115) — engine's `m_b2DScreenDimension`.
        screen_space: Option<bool>,
        tail_lines: Vec<String>,
    },
    /// Ribbon trail between two moving endpoints (type 110).
    Trail {
        org_pos1: [f32; 3],
        org_pos2: [f32; 3],
        enable_mat: bool,
        enable_org_pos1: bool,
        enable_org_pos2: bool,
        seg_life: i32,
        bind: Option<bool>,
        /// 0 = line, 1 = spline, 2 = line_kp.
        spline: Option<i32>,
        sample_freq: Option<i32>,
        perturb_mode: Option<i32>,
        /// Perturb `Spreading` sub-block (v>=122 and `perturb_mode == 1`).
        trail_perturb: Option<TrailPerturbSpreading>,
        face_camera: Option<bool>,
        tail_lines: Vec<String>,
    },
    /// Dynamic light source (type 130). Mirrors D3D D3DLIGHT9 parameters
    /// plus an engine-specific `inner_use` flag.
    Light {
        light_type: i32,
        diffuse: u32,
        specular: u32,
        ambient: u32,
        position: [f32; 3],
        direction: [f32; 3],
        range: f32,
        falloff: f32,
        attenuation0: f32,
        attenuation1: f32,
        attenuation2: f32,
        theta: f32,
        phi: f32,
        inner_use: Option<bool>,
        tail_lines: Vec<String>,
    },
    /// Expanding ring effect (type 140).
    Ring {
        radius: f32,
        height: f32,
        pitch: f32,
        sects: Option<i32>,
        no_rad_scale: Option<bool>,
        no_hei_scale: Option<bool>,
        org_at_center: Option<bool>,
        tail_lines: Vec<String>,
    },
    /// Embedded 3D model (type 160).
    Model {
        model_path: String,
        model_act_name: Option<String>,
        loops: Option<i32>,
        alpha_cmp: Option<bool>,
        write_z: Option<bool>,
        use_3d_cam: Option<bool>,
        facing_dir: Option<bool>,
        tail_lines: Vec<String>,
    },
    /// Reference to another `.gfx` (type 200).
    Container {
        gfx_path: String,
        out_color: Option<bool>,
        loop_flag: Option<bool>,
        play_speed: Option<f32>,
        /// Engine emits a shortened key `DummyUseGScale:` for this field.
        dummy_use_g_scale: Option<bool>,
        tail_lines: Vec<String>,
    },
    /// Particle system (types 120 / 121 / 122 / 123 / 124 / 125).
    Particle {
        quota: i32,
        particle_width: f32,
        particle_height: f32,
        three_d_particle: bool,
        facing: i32,
        scale_no_off: Option<bool>,
        /// Two separate `NoScale:` lines — (width, height).
        no_scale: Option<(bool, bool)>,
        /// Two separate `OrgPt:` lines — (width, height).
        org_pt: Option<(f32, f32)>,
        is_use_par_uv: Option<bool>,
        is_start_on_grnd: Option<bool>,
        stop_emit_when_fade: Option<bool>,
        init_random_texture: Option<bool>,
        z_offset: Option<f32>,
        emitter: Emitter,
        /// AffectorCount + affector blocks + KeyPointSet, not yet structured.
        tail_lines: Vec<String>,
    },
    /// Freeform w×h vertex grid with per-vertex colors (type 210).
    #[serde(rename = "grid_decal_3d")]
    GridDecal3D {
        w_number: i32,
        h_number: i32,
        /// Flattened row-major vertex array; length = `w_number * h_number`.
        vertices: Vec<GridVertex>,
        grid_size: f32,
        z_offset: Option<f32>,
        /// Grid-animation keyframes (v>=99). Each key holds the modified
        /// vertex array at a given point in time.
        animation_keys: Vec<GridAnimKey>,
        aff_by_scl: Option<bool>,
        rot_from_view: Option<bool>,
        offset_height: Option<f32>,
        always_on_ground: Option<bool>,
        tail_lines: Vec<String>,
    },
    /// Segmented lightning bolt between two points (type 150).
    Lightning {
        fields: LightningFields,
        tail_lines: Vec<String>,
    },
    /// Branching lightning bolt with randomized paths (type 151). No
    /// `NoiseCtrl` prefix — just scalar parameters.
    LtnBolt {
        deviation: f32,
        step_min: f32,
        step_max: f32,
        width_start: f32,
        width_end: f32,
        alpha_start: f32,
        alpha_end: f32,
        stroke_amp: f32,
        max_steps: i32,
        max_branches: i32,
        interval: i32,
        per_bolts: i32,
        circles: i32,
        tail_lines: Vec<String>,
    },
    /// Extended lightning with v>=67 tail fade / render-side flags (type 152).
    LightningEx {
        fields: LightningFields,
        is_append: Option<bool>,
        render_side: Option<i32>,
        is_tail_disappear: Option<bool>,
        verts_life: Option<i32>,
        is_tail_fadeout: Option<bool>,
        tail_lines: Vec<String>,
    },
    /// 3D positional sound emitter (type 170).
    Sound {
        /// Sound file candidates. v<88 always has exactly one entry;
        /// v>=88 uses `PathNum:` + N × `Path:` for random selection.
        paths: Vec<String>,
        param_info: SoundParamInfo,
        /// New audio-event block (v>=96) — event path + distance /
        /// custom-attenuation flags.
        audio_event: Option<SoundAudioEvent>,
        tail_lines: Vec<String>,
    },
}

impl ElementBody {
    /// Raw body text for debug display — raw lines for `Unknown`, or the
    /// unparsed affector/KeyPointSet tail for typed variants.
    pub fn raw_text(&self) -> String {
        let lines: &[String] = match self {
            ElementBody::Unknown { lines } => lines,
            ElementBody::Decal { tail_lines, .. }
            | ElementBody::Trail { tail_lines, .. }
            | ElementBody::Light { tail_lines, .. }
            | ElementBody::Ring { tail_lines, .. }
            | ElementBody::Model { tail_lines, .. }
            | ElementBody::Container { tail_lines, .. }
            | ElementBody::Particle { tail_lines, .. }
            | ElementBody::GridDecal3D { tail_lines, .. }
            | ElementBody::Lightning { tail_lines, .. }
            | ElementBody::LtnBolt { tail_lines, .. }
            | ElementBody::LightningEx { tail_lines, .. }
            | ElementBody::Sound { tail_lines, .. } => tail_lines,
        };
        lines.join("\n")
    }
}

/// Trail `Spreading` perturb sub-block (v>=122, `PerturbMode == 1`).
/// Mirrors `A3DTrail::Load`'s `eTrailPerturbMode_Spreading` branch.
#[apply(bindable)]
pub struct TrailPerturbSpreading {
    pub disappear_speed: f32,
    pub spread_speed: f32,
    pub spread_seg_count: i32,
    pub spread_acceleration: f32,
    pub spread_dir_min: [f32; 3],
    pub spread_dir_max: [f32; 3],
    pub disappear_acceleration: f32,
    pub spread_delay: f32,
    pub disappear_delay: f32,
}

/// Particle emitter block — shared emitter fields plus shape-specific
/// fields for the concrete emitter shape.
#[apply(bindable)]
pub struct Emitter {
    pub emission_rate: f32,
    pub angle: f32,
    pub speed: f32,
    pub par_acc: Option<f32>,
    pub acc_dir: [f32; 3],
    pub acc: f32,
    pub ttl: f32,
    pub color_min: u32,
    pub color_max: u32,
    pub scale_min: f32,
    pub scale_max: f32,
    pub rot_min: Option<f32>,
    pub rot_max: Option<f32>,
    pub is_surface: bool,
    pub is_bind: bool,
    pub is_drag: Option<bool>,
    pub drag_pow: Option<f32>,
    pub par_ini_dir: Option<[f32; 3]>,
    pub is_use_hsv_interp: Option<bool>,
    pub shape: EmitterShape,
}

/// Emitter-shape-specific fields. Point has none; Box / Ellipsoid /
/// Cylinder carry an AreaSize vec3 plus (for Ellipsoid/Cylinder)
/// subdivision parameters. MultiPlane and Curve are not yet
/// structurally parsed — their shape-specific lines are held as raw
/// text.
#[apply(bindable)]
#[serde(tag = "shape", rename_all = "snake_case")]
pub enum EmitterShape {
    /// Represented as empty struct variant rather than unit — PyO3
    /// complex enums do not yet accept unit variants.
    Point {},
    Box {
        area_size: [f32; 3],
    },
    Ellipsoid {
        area_size: [f32; 3],
        is_avg_gen: Option<bool>,
        alpha_seg: Option<i32>,
        beta_seg: Option<i32>,
    },
    Cylinder {
        area_size: [f32; 3],
        is_avg_gen: Option<bool>,
        alpha_seg: Option<i32>,
        beta_seg: Option<i32>,
    },
    MultiPlane {
        raw_lines: Vec<String>,
    },
    Curve {
        raw_lines: Vec<String>,
    },
}

/// A single grid vertex — position + packed ARGB color.
#[apply(bindable)]
pub struct GridVertex {
    pub pos: [f32; 3],
    pub color: u32,
}

/// Grid-animation keyframe: a modified vertex array at time `time_ms`.
#[apply(bindable)]
pub struct GridAnimKey {
    pub time_ms: i32,
    /// Same length and row-major order as `ElementBody::GridDecal3D::vertices`.
    pub vertices: Vec<GridVertex>,
}

/// Perlin noise parameters. Prefix of every Lightning / LightningEx
/// body.
#[apply(bindable)]
pub struct NoiseCtrl {
    pub buf_len: i32,
    pub amplitude: f32,
    pub wave_len: i32,
    pub persistence: f32,
    pub octave_num: i32,
}

/// Animatable float value track (v>=102 lightning amplitude).
#[apply(bindable)]
pub struct FloatValueTrans {
    pub dest_num: i32,
    pub start_time: i32,
    /// `dest_num + 1` values.
    pub dest_values: Vec<f32>,
    /// `dest_num` values.
    pub trans_times: Vec<i32>,
}

/// Scalar payload shared by `Lightning` and `LightningEx` variants.
#[apply(bindable)]
pub struct LightningFields {
    pub noise_ctrl: NoiseCtrl,
    pub start_pos: [f32; 3],
    pub end_pos: [f32; 3],
    pub segs: i32,
    pub light_num: i32,
    pub wave_len: f32,
    pub interval: i32,
    pub width_start: f32,
    /// At v<=5 the engine duplicates `width_start` here.
    pub width_end: f32,
    pub alpha_start: Option<f32>,
    pub alpha_end: Option<f32>,
    pub width_mid: Option<f32>,
    pub alpha_mid: Option<f32>,
    /// `Some` for v<=101 (single scalar); mutually exclusive with
    /// `amplitude_trans`.
    pub amplitude: Option<f32>,
    /// `Some` for v>=102 (animated amplitude track).
    pub amplitude_trans: Option<FloatValueTrans>,
    pub pos1_enable: bool,
    pub pos2_enable: bool,
    pub use_normal: Option<bool>,
    pub normal: Option<[f32; 3]>,
    pub filter_type: Option<i32>,
    pub wave_moving: Option<bool>,
    pub wave_moving_speed: Option<f32>,
    pub fix_wave_length: Option<bool>,
    pub num_waves: Option<f32>,
}

/// `GfxSoundParamInfo` — sound parameter block shared by both sound
/// implementations. Has its own internal version (`SoundVer`) distinct
/// from the GFX file version.
#[apply(bindable)]
pub struct SoundParamInfo {
    pub sound_ver: i32,
    pub force_2d: bool,
    pub is_loop: bool,
    pub volume_min: u32,
    pub volume_max: u32,
    pub absolute_volume: Option<bool>,
    pub pitch_min: Option<f32>,
    pub pitch_max: Option<f32>,
    pub min_dist: f32,
    pub max_dist: f32,
    pub fix_speed: Option<bool>,
    pub silent_header: Option<i32>,
    pub percent_start: Option<f32>,
    pub group: Option<i32>,
}

/// Audio-event sub-block (present at v>=96). Carries the event path
/// plus its own distance-attenuation overrides.
#[apply(bindable)]
pub struct SoundAudioEvent {
    pub event_path: String,
    pub use_custom: bool,
    pub min_dist: f32,
    pub max_dist: f32,
}

/// A parsed GFX visual effect container.
#[apply(bindable)]
pub struct GfxEffect {
    pub version: u32,
    pub default_scale: f32,
    pub play_speed: f32,
    pub default_alpha: f32,
    pub face_to_viewer: i32,
    pub fade_by_dist: i32,
    pub fade_start: f32,
    pub fade_end: f32,
    /// AABB minimum corner (present for v >= 25).
    pub aabb_min: Option<[f32; 3]>,
    /// AABB maximum corner (present for v >= 25).
    pub aabb_max: Option<[f32; 3]>,
    pub use_aabb: i32,
    pub elements: Vec<GfxElement>,
}

impl GfxEffect {
    pub fn parse(data: &[u8]) -> Result<Self> {
        let text = decode_gbk(data)?;
        let mut r = Lines::new(&text);

        // Version line: "Version: %d" or "MOXTVersion: %d"
        let version_line = r.next_line()?;
        let version = if let Some(v) = version_line
            .strip_prefix("Version: ")
            .or_else(|| version_line.strip_prefix("MOXTVersion: "))
        {
            v.trim()
                .parse::<u32>()
                .map_err(|_| eyre!("Invalid version: '{}'", v))?
        } else {
            eyre::bail!("Expected Version/MOXTVersion, got: '{}'", version_line);
        };

        if version >= 89 {
            r.read::<i32>("IsAngelica3")?;
        }

        let mut default_scale = 1.0_f32;
        if version >= 16 {
            // v103 fixed the "Dedault" typo to "Default"; accept both.
            default_scale = r.read_alt::<f32>(&["DedaultScale", "DefaultScale"])?;
        }

        let mut play_speed = 1.0_f32;
        if version >= 17 {
            play_speed = r.read::<f32>("PlaySpeed")?;
        }

        let mut default_alpha = 1.0_f32;
        if version >= 18 {
            default_alpha = r.read::<f32>("DefaultAlpha")?;
        }

        if version >= 23 {
            r.read::<i32>("Raytrace")?;
        }

        let mut face_to_viewer = 0_i32;
        if version >= 38 {
            face_to_viewer = r.read::<i32>("FaceToViewer")?;
        }

        let mut fade_by_dist = 0_i32;
        let mut fade_start = 0.0_f32;
        let mut fade_end = 0.0_f32;
        if version >= 27 {
            fade_by_dist = r.read::<i32>("FadeByDist")?;
            fade_start = r.read::<f32>("FadeStart")?;
            fade_end = r.read::<f32>("FadeEnd")?;
        }

        let mut aabb_min: Option<[f32; 3]> = None;
        let mut aabb_max: Option<[f32; 3]> = None;
        if version >= 25 {
            aabb_min = Some(r.read::<[f32; 3]>("Vec")?);
            aabb_max = Some(r.read::<[f32; 3]>("Vec")?);
        }

        let mut use_aabb = 0_i32;
        if version >= 53 {
            use_aabb = r.read::<i32>("UseAABB")?;
        }

        if version >= 84 {
            r.read::<i32>("AccurateAABB")?;
        }

        if version >= 24 {
            let shake_cam = r.read::<i32>("ShakeCam")?;
            if shake_cam != 0 {
                // Skip complex NoiseCtrl + IShakeCamera block until a known key.
                const SHAKE_TERMINATORS: &[&str] = &[
                    "ShakeDamp",
                    "NoChangeDir",
                    "2DRender",
                    "2DBackLayer",
                    "PhysExist",
                    "GFXELEMENTCOUNT",
                ];
                while !r.done() {
                    if let Some(k) = r.peek_key()
                        && SHAKE_TERMINATORS.contains(&k)
                    {
                        break;
                    }
                    r.next_line()?;
                }
            }
        }

        if version >= 82 {
            r.read::<i32>("ShakeDamp")?;
        }

        if version >= 46 {
            r.read::<i32>("NoChangeDir")?;
        }

        if version >= 50 {
            r.read::<i32>("2DRender")?;
            r.read::<i32>("2DBackLayer")?;
        }

        // Optional peek-and-read — the stock version gate for this field
        // (v>=112) doesn't match all real files; some variants emit it
        // earlier.
        if r.peek_key() == Some("SkipTime") {
            r.read::<i32>("SkipTime")?;
        }

        if version >= 63 {
            r.read::<i32>("PhysExist")?;
        }

        let element_count = checked_count(r.read::<i32>("GFXELEMENTCOUNT")?, "GFXELEMENTCOUNT")?;
        let mut elements = Vec::with_capacity(element_count);

        for _ in 0..element_count {
            elements.push(parse_element(&mut r, version)?);
        }

        Ok(GfxEffect {
            version,
            default_scale,
            play_speed,
            default_alpha,
            face_to_viewer,
            fade_by_dist,
            fade_start,
            fade_end,
            aabb_min,
            aabb_max,
            use_aabb,
            elements,
        })
    }
}

/// Dispatch element-body parsing by type. Unparsed types consume all lines
/// up to the next element into `ElementBody::Unknown`; parsed types first
/// skip past variant-specific pre-body header extensions (pixel shader block,
/// CanDoFadeOut, HLSL metadata, etc. whose layout varies across engine
/// builds), then read their typed fields, then collect any remaining tail.
fn parse_body(
    r: &mut Lines<'_>,
    version: u32,
    element_type: &GfxElementType,
) -> Result<ElementBody> {
    use GfxElementType::*;
    match element_type {
        Decal3D | Decal2D | DecalBillboard => {
            skip_to_body_start(r, &["Width"])?;
            parse_decal_body(r, version)
        }
        Trail => {
            skip_to_body_start(r, &["OrgPos1"])?;
            parse_trail_body(r, version)
        }
        Light => {
            skip_to_body_start(r, &["LightType"])?;
            parse_light_body(r, version)
        }
        Ring => {
            skip_to_body_start(r, &["Radius"])?;
            parse_ring_body(r, version)
        }
        Model => {
            skip_to_body_start(r, &["ModelPath"])?;
            parse_model_body(r, version)
        }
        GfxContainer => {
            skip_to_body_start(r, &["GfxPath"])?;
            parse_container_body(r, version)
        }
        ParticlePoint | ParticleBox | ParticleMultiplane | ParticleEllipsoid | ParticleCylinder
        | ParticleCurve => {
            skip_to_body_start(r, &["Quota"])?;
            parse_particle_body(r, version, element_type)
        }
        GridDecal3D => {
            skip_to_body_start(r, &["wNumber"])?;
            parse_grid_decal_body(r, version)
        }
        Lightning => {
            skip_to_body_start(r, &["BufLen"])?;
            parse_lightning_body(r, version)
        }
        LightningEx => {
            skip_to_body_start(r, &["BufLen"])?;
            parse_lightning_ex_body(r, version)
        }
        LtnBolt => {
            skip_to_body_start(r, &["Deviation"])?;
            parse_ltn_bolt_body(r, version)
        }
        Sound => {
            skip_to_body_start(r, &["PathNum", "Path"])?;
            parse_sound_body(r, version)
        }
        _ => Ok(ElementBody::Unknown {
            lines: collect_tail(r)?,
        }),
    }
}

/// Advance past pre-body header extensions until the first known body-start
/// key. Stops at EOF or the next element boundary (`GFXELEMENTID`) too, in
/// which case the subsequent body parser will error out on the missing
/// first field — that's the desired signal for malformed bodies.
fn skip_to_body_start(r: &mut Lines<'_>, starts: &[&str]) -> Result<()> {
    loop {
        match r.peek_key() {
            None | Some("GFXELEMENTID") => return Ok(()),
            Some(k) if starts.contains(&k) => return Ok(()),
            _ => {
                r.next_line()?;
            }
        }
    }
}

/// Collect remaining lines up to the next element boundary (or EOF).
fn collect_tail(r: &mut Lines<'_>) -> Result<Vec<String>> {
    let mut out = Vec::new();
    while !r.done() && r.peek_key() != Some("GFXELEMENTID") {
        out.push(r.next_line()?.to_string());
    }
    Ok(out)
}

/// Parse a decimal u32 value. The engine emits D3D color DWORDs via
/// `sscanf("%d", ...)` — when the high bit is set the text is signed, so we
/// parse as `i32` first and reinterpret the bits.
pub(super) fn read_u32_dec(r: &mut Lines<'_>, key: &str) -> Result<u32> {
    let v = r.read_value(key)?;
    v.parse::<i32>()
        .map(|n| n as u32)
        .map_err(|_| eyre!("Invalid u32 for '{}': '{}'", key, v))
}

fn parse_decal_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    let width = r.read::<f32>("Width")?;
    let height = r.read::<f32>("Height")?;
    let rot_from_view = r.read::<bool>("RotFromView")?;
    let grnd_norm_only = r.read_if::<bool>(version >= 26, "GrndNormOnly")?;
    let no_scale = if version >= 36 {
        Some((r.read::<bool>("NoScale")?, r.read::<bool>("NoScale")?))
    } else {
        None
    };
    let org_pt = if version >= 36 {
        Some((r.read::<f32>("OrgPt")?, r.read::<f32>("OrgPt")?))
    } else {
        None
    };
    let z_offset = r.read_if::<f32>(version >= 42, "ZOffset")?;
    let match_surface = r.read_if::<bool>(version >= 54, "MatchSurface")?;
    let surface_use_parent_dir = r.read_if::<bool>(version >= 86, "SurfaceUseParentDir")?;
    let max_extent = r.read_if::<f32>(version >= 55, "MaxExtent")?;
    let yaw_effect = r.read_if::<bool>(version >= 61, "YawEffect")?;
    let screen_space = r.read_if::<bool>(version >= 115, "ScreenSpace")?;
    let tail_lines = collect_tail(r)?;
    Ok(ElementBody::Decal {
        width,
        height,
        rot_from_view,
        grnd_norm_only,
        no_scale,
        org_pt,
        z_offset,
        match_surface,
        surface_use_parent_dir,
        max_extent,
        yaw_effect,
        screen_space,
        tail_lines,
    })
}

fn parse_light_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    // Attenuation1 and Attenuation2 are emitted under the key
    // `Attenuation0:` — engine format-string typo, read three lines under
    // the same name.
    let light_type = r.read::<i32>("LightType")?;
    let diffuse = read_u32_dec(r, "Diffuse")?;
    let specular = read_u32_dec(r, "Specular")?;
    let ambient = read_u32_dec(r, "Ambient")?;
    let position = r.read::<[f32; 3]>("Position")?;
    let direction = r.read::<[f32; 3]>("Direction")?;
    let range = r.read::<f32>("Range")?;
    let falloff = r.read::<f32>("FallOff")?;
    let attenuation0 = r.read::<f32>("Attenuation0")?;
    let attenuation1 = r.read::<f32>("Attenuation0")?;
    let attenuation2 = r.read::<f32>("Attenuation0")?;
    let theta = r.read::<f32>("Theta")?;
    let phi = r.read::<f32>("Phi")?;
    let inner_use = r.read_if::<bool>(version >= 119, "InnerUse")?;
    let tail_lines = collect_tail(r)?;
    Ok(ElementBody::Light {
        light_type,
        diffuse,
        specular,
        ambient,
        position,
        direction,
        range,
        falloff,
        attenuation0,
        attenuation1,
        attenuation2,
        theta,
        phi,
        inner_use,
        tail_lines,
    })
}

fn parse_ring_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    let radius = r.read::<f32>("Radius")?;
    let height = r.read::<f32>("Height")?;
    let pitch = r.read::<f32>("Pitch")?;
    let sects = r.read_if::<i32>(version >= 14, "Sects")?;
    let no_rad_scale = r.read_if::<bool>(version >= 14, "NoRadScale")?;
    let no_hei_scale = r.read_if::<bool>(version >= 14, "NoHeiScale")?;
    let org_at_center = r.read_if::<bool>(version >= 15, "OrgAtCenter")?;
    let tail_lines = collect_tail(r)?;
    Ok(ElementBody::Ring {
        radius,
        height,
        pitch,
        sects,
        no_rad_scale,
        no_hei_scale,
        org_at_center,
        tail_lines,
    })
}

fn parse_model_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    let model_path = r.read::<String>("ModelPath")?;
    let model_act_name = r.read_if::<String>(version >= 19, "ModelActName")?;
    let loops = r.read_if::<i32>(version >= 31, "Loops")?;
    let alpha_cmp = r.read_if::<bool>(version >= 29, "AlphaCmp")?;
    let write_z = r.read_if::<bool>(version >= 49, "WriteZ")?;
    let use_3d_cam = r.read_if::<bool>(version >= 77, "Use3DCam")?;
    let facing_dir = r.read_if::<bool>(version >= 99, "FacingDir")?;
    let tail_lines = collect_tail(r)?;
    Ok(ElementBody::Model {
        model_path,
        model_act_name,
        loops,
        alpha_cmp,
        write_z,
        use_3d_cam,
        facing_dir,
        tail_lines,
    })
}

fn parse_particle_body(
    r: &mut Lines<'_>,
    version: u32,
    element_type: &GfxElementType,
) -> Result<ElementBody> {
    let quota = r.read::<i32>("Quota")?;
    let particle_width = r.read::<f32>("ParticleWidth")?;
    let particle_height = r.read::<f32>("ParticleHeight")?;
    let three_d_particle = r.read::<bool>("3DParticle")?;
    let facing = r.read::<i32>("Facing")?;
    let scale_no_off = r.read_if::<bool>(version >= 30, "ScaleNoOff")?;
    let no_scale = if version >= 37 {
        Some((r.read::<bool>("NoScale")?, r.read::<bool>("NoScale")?))
    } else {
        None
    };
    let org_pt = if version >= 37 {
        Some((r.read::<f32>("OrgPt")?, r.read::<f32>("OrgPt")?))
    } else {
        None
    };
    let is_use_par_uv = r.read_if::<bool>(version >= 72, "IsUseParUV")?;
    let is_start_on_grnd = r.read_if::<bool>(version >= 79, "IsStartOnGrnd")?;
    let stop_emit_when_fade = r.read_if::<bool>(version >= 92, "StopEmitWhenFade")?;
    let init_random_texture = r.read_if::<bool>(version >= 99, "InitRandomTexture")?;
    let z_offset = r.read_if::<f32>(version >= 108, "ZOffset")?;

    let emitter = parse_emitter(r, version, element_type)?;
    let tail_lines = collect_tail(r)?;
    Ok(ElementBody::Particle {
        quota,
        particle_width,
        particle_height,
        three_d_particle,
        facing,
        scale_no_off,
        no_scale,
        org_pt,
        is_use_par_uv,
        is_start_on_grnd,
        stop_emit_when_fade,
        init_random_texture,
        z_offset,
        emitter,
        tail_lines,
    })
}

fn parse_emitter(
    r: &mut Lines<'_>,
    version: u32,
    element_type: &GfxElementType,
) -> Result<Emitter> {
    let emission_rate = r.read::<f32>("EmissionRate")?;
    let angle = r.read::<f32>("Angle")?;
    let speed = r.read::<f32>("Speed")?;
    let par_acc = r.read_if::<f32>(version >= 20, "ParAcc")?;
    let acc_dir = r.read::<[f32; 3]>("AccDir")?;
    let acc = r.read::<f32>("Acc")?;
    let ttl = r.read::<f32>("TTL")?;
    let color_min = read_u32_dec(r, "ColorMin")?;
    let color_max = read_u32_dec(r, "ColorMax")?;
    let (scale_min, scale_max) = if version <= 1 {
        let s = r.read::<f32>("Scale")?;
        (s, s)
    } else {
        (r.read::<f32>("ScaleMin")?, r.read::<f32>("ScaleMax")?)
    };
    let rot_min = r.read_if::<f32>(version >= 10, "RotMin")?;
    let rot_max = r.read_if::<f32>(version >= 10, "RotMax")?;
    let is_surface = r.read::<bool>("IsSurface")?;
    let is_bind = r.read::<bool>("IsBind")?;
    let is_drag = r.read_if::<bool>(version >= 43, "IsDrag")?;
    let drag_pow = r.read_if::<f32>(version >= 48, "DragPow")?;
    let par_ini_dir = r.read_if::<[f32; 3]>(version >= 62, "ParIniDir")?;
    let is_use_hsv_interp = r.read_if::<bool>(version >= 70, "IsUseHSVInterp")?;

    let shape = parse_emitter_shape(r, version, element_type)?;

    Ok(Emitter {
        emission_rate,
        angle,
        speed,
        par_acc,
        acc_dir,
        acc,
        ttl,
        color_min,
        color_max,
        scale_min,
        scale_max,
        rot_min,
        rot_max,
        is_surface,
        is_bind,
        is_drag,
        drag_pow,
        par_ini_dir,
        is_use_hsv_interp,
        shape,
    })
}

fn parse_emitter_shape(
    r: &mut Lines<'_>,
    version: u32,
    element_type: &GfxElementType,
) -> Result<EmitterShape> {
    use GfxElementType::*;
    match element_type {
        ParticlePoint => Ok(EmitterShape::Point {}),
        ParticleBox => {
            let area_size = r.read::<[f32; 3]>("AreaSize")?;
            Ok(EmitterShape::Box { area_size })
        }
        ParticleEllipsoid => {
            let area_size = r.read::<[f32; 3]>("AreaSize")?;
            let (is_avg_gen, alpha_seg, beta_seg) = if version >= 71 {
                (
                    Some(r.read::<bool>("IsAvgGen")?),
                    Some(r.read::<i32>("AlphaSeg")?),
                    Some(r.read::<i32>("BetaSeg")?),
                )
            } else {
                (None, None, None)
            };
            Ok(EmitterShape::Ellipsoid {
                area_size,
                is_avg_gen,
                alpha_seg,
                beta_seg,
            })
        }
        ParticleCylinder => {
            let area_size = r.read::<[f32; 3]>("AreaSize")?;
            let (is_avg_gen, alpha_seg, beta_seg) = if version >= 99 {
                (
                    Some(r.read::<bool>("IsAvgGen")?),
                    Some(r.read::<i32>("AlphaSeg")?),
                    Some(r.read::<i32>("BetaSeg")?),
                )
            } else {
                (None, None, None)
            };
            Ok(EmitterShape::Cylinder {
                area_size,
                is_avg_gen,
                alpha_seg,
                beta_seg,
            })
        }
        ParticleMultiplane => Ok(EmitterShape::MultiPlane {
            raw_lines: collect_emitter_tail(r)?,
        }),
        ParticleCurve => Ok(EmitterShape::Curve {
            raw_lines: collect_emitter_tail(r)?,
        }),
        _ => Ok(EmitterShape::MultiPlane { raw_lines: vec![] }),
    }
}

/// Collect subclass-specific emitter lines up to the `AffectorCount`
/// boundary (or the next element). Used for emitter shapes we don't yet
/// structurally parse.
fn collect_emitter_tail(r: &mut Lines<'_>) -> Result<Vec<String>> {
    let mut out = Vec::new();
    while !r.done() && r.peek_key() != Some("GFXELEMENTID") && r.peek_key() != Some("AffectorCount")
    {
        out.push(r.next_line()?.to_string());
    }
    Ok(out)
}

fn parse_grid_decal_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    let w_number = r.read::<i32>("wNumber")?;
    let h_number = r.read::<i32>("hNumber")?;
    let vert_count = checked_grid_size(w_number, h_number)?;
    let mut vertices = Vec::with_capacity(vert_count);
    for i in 0..vert_count {
        let pos_line = r.next_line()?;
        let mut parts = pos_line.split_whitespace();
        let mut next_float = || -> Result<f32> {
            let s = parts
                .next()
                .ok_or_else(|| eyre!("grid vertex #{i}: missing float in '{pos_line}'"))?;
            f32::parse_line_value(s).ok_or_else(|| eyre!("grid vertex #{i}: invalid float '{s}'"))
        };
        let pos = [next_float()?, next_float()?, next_float()?];
        let color = r.read_hex_u32("dwColor")?;
        vertices.push(GridVertex { pos, color });
    }
    let grid_size = r.read::<f32>("fGridSize")?;
    let z_offset = r.read_if::<f32>(version >= 60, "fZOffset")?;
    let animation_keys = if version >= 99 {
        read_grid_animation_keys(r, vert_count)?
    } else {
        Vec::new()
    };
    let aff_by_scl = r.read_if::<bool>(version >= 100, "AffByScl")?;
    let rot_from_view = r.read_if::<bool>(version >= 100, "RotFromView")?;
    let offset_height = r.read_if::<f32>(version >= 101, "fOffsetHeight")?;
    let always_on_ground = r.read_if::<bool>(version >= 114, "bAlwaysOnGround")?;
    let tail_lines = collect_tail(r)?;
    Ok(ElementBody::GridDecal3D {
        w_number,
        h_number,
        vertices,
        grid_size,
        z_offset,
        animation_keys,
        aff_by_scl,
        rot_from_view,
        offset_height,
        always_on_ground,
        tail_lines,
    })
}

/// Validate a grid's `w × h` dimensions: reject negatives, overflow, or
/// absurd totals that would allow a hostile/corrupt file to trigger a
/// giant `Vec::with_capacity`. The limit is deliberately generous so
/// any realistic editor output still parses.
fn checked_grid_size(w: i32, h: i32) -> Result<usize> {
    const MAX: usize = 1_000_000;
    if w < 0 || h < 0 {
        eyre::bail!("grid dimensions invalid: w={w}, h={h}");
    }
    let n = (w as usize).checked_mul(h as usize).filter(|&n| n <= MAX);
    n.ok_or_else(|| eyre!("grid dimensions invalid: w={w}, h={h} (product exceeds {MAX})"))
}

/// Reject a negative or unreasonably huge count read from a file — the
/// same guard as `checked_grid_size` but for the common "read N, allocate
/// Vec of that size, loop N times" pattern. `MAX` is deliberately
/// generous so any realistic engine output still parses.
pub(super) fn checked_count(n: i32, what: &str) -> Result<usize> {
    const MAX: i32 = 1_000_000;
    if !(0..=MAX).contains(&n) {
        eyre::bail!("{what} out of range: {n}");
    }
    Ok(n as usize)
}

/// Read the v>=99 GridAnimation sub-block: `keyNumber` plus up to 5
/// keys (engine hard-cap), each with a `GridAnimationLines` count
/// followed by that many base64 payload lines. The concatenated base64
/// decodes to `int32 time` + `vert_count` × 16-byte (vec3 pos, u32 argb)
/// entries.
fn read_grid_animation_keys(r: &mut Lines<'_>, vert_count: usize) -> Result<Vec<GridAnimKey>> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let num_keys = r.read::<i32>("keyNumber")?.clamp(0, 5);
    let mut keys = Vec::with_capacity(num_keys as usize);
    for k in 0..num_keys {
        let line_count = checked_count(r.read::<i32>("GridAnimationLines")?, "GridAnimationLines")?;
        let mut b64 = String::with_capacity(line_count * 80);
        for _ in 0..line_count {
            b64.push_str(r.next_line()?);
        }
        let bytes = STANDARD
            .decode(&b64)
            .map_err(|e| eyre!("grid anim key #{k}: base64 decode: {e}"))?;
        let expected = 4 + vert_count * 16;
        if bytes.len() < expected {
            eyre::bail!(
                "grid anim key #{k}: payload {} bytes, expected {}",
                bytes.len(),
                expected
            );
        }
        let read_f32 = |b: &[u8]| f32::from_le_bytes(b.try_into().unwrap());
        let time_ms = i32::from_le_bytes(bytes[0..4].try_into().unwrap());
        let vertices = bytes[4..4 + vert_count * 16]
            .chunks_exact(16)
            .map(|c| GridVertex {
                pos: [read_f32(&c[0..4]), read_f32(&c[4..8]), read_f32(&c[8..12])],
                color: u32::from_le_bytes(c[12..16].try_into().unwrap()),
            })
            .collect();
        keys.push(GridAnimKey { time_ms, vertices });
    }
    Ok(keys)
}

pub(super) fn parse_noise_ctrl(r: &mut Lines<'_>) -> Result<NoiseCtrl> {
    Ok(NoiseCtrl {
        buf_len: r.read("BufLen")?,
        amplitude: r.read("Amplitude")?,
        wave_len: r.read("WaveLen")?,
        persistence: r.read("Persistence")?,
        octave_num: r.read("OctaveNum")?,
    })
}

fn parse_float_value_trans(r: &mut Lines<'_>) -> Result<FloatValueTrans> {
    let dest_num = checked_count(r.read::<i32>("DestNum")?, "FloatValueTrans DestNum")?;
    Ok(FloatValueTrans {
        dest_num: dest_num as i32,
        start_time: r.read("StartTime")?,
        dest_values: (0..=dest_num)
            .map(|_| r.read("DestVal"))
            .collect::<Result<_>>()?,
        trans_times: (0..dest_num)
            .map(|_| r.read("TransTime"))
            .collect::<Result<_>>()?,
    })
}

fn parse_lightning_fields(r: &mut Lines<'_>, version: u32) -> Result<LightningFields> {
    // width_end needs width_start; everything else inlines into the struct.
    let noise_ctrl = parse_noise_ctrl(r)?;
    let start_pos = r.read("StartPos")?;
    let end_pos = r.read("EndPos")?;
    let segs = r.read("Segs")?;
    let light_num = r.read("LightNum")?;
    let wave_len = r.read("WaveLen")?;
    let interval = r.read("Interval")?;
    let width_start = r.read::<f32>("Width")?;
    let width_end = if version >= 6 {
        r.read::<f32>("Width")?
    } else {
        width_start
    };
    Ok(LightningFields {
        noise_ctrl,
        start_pos,
        end_pos,
        segs,
        light_num,
        wave_len,
        interval,
        width_start,
        width_end,
        alpha_start: r.read_if(version >= 7, "Alpha")?,
        alpha_end: r.read_if(version >= 7, "Alpha")?,
        width_mid: r.read_if(version >= 35, "Width")?,
        alpha_mid: r.read_if(version >= 35, "Alpha")?,
        amplitude: r.read_if(version < 102, "Amplitude")?,
        amplitude_trans: (version >= 102)
            .then(|| parse_float_value_trans(r))
            .transpose()?,
        pos1_enable: r.read("Pos1Enable")?,
        pos2_enable: r.read("Pos2Enable")?,
        use_normal: r.read_if(version >= 39, "UseNormal")?,
        normal: r.read_if(version >= 39, "Normal")?,
        filter_type: r.read_if(version >= 73, "Filter")?,
        wave_moving: r.read_if(version >= 102, "WaveMoving")?,
        wave_moving_speed: r.read_if(version >= 102, "WaveMovingSpeed")?,
        fix_wave_length: r.read_if(version >= 102, "FixWaveLength")?,
        num_waves: r.read_if(version >= 102, "NumWaves")?,
    })
}

fn parse_lightning_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    Ok(ElementBody::Lightning {
        fields: parse_lightning_fields(r, version)?,
        tail_lines: collect_tail(r)?,
    })
}

fn parse_lightning_ex_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    Ok(ElementBody::LightningEx {
        fields: parse_lightning_fields(r, version)?,
        is_append: r.read_if(version >= 67, "isappend")?,
        render_side: r.read_if(version >= 67, "renderside")?,
        is_tail_disappear: r.read_if(version >= 68, "istaildisappear")?,
        verts_life: r.read_if(version >= 68, "vertslife")?,
        is_tail_fadeout: r.read_if(version >= 69, "tailfadeout")?,
        tail_lines: collect_tail(r)?,
    })
}

fn parse_ltn_bolt_body(r: &mut Lines<'_>, _version: u32) -> Result<ElementBody> {
    Ok(ElementBody::LtnBolt {
        deviation: r.read("Deviation")?,
        step_min: r.read("StepMin")?,
        step_max: r.read("StepMax")?,
        width_start: r.read("WidthStart")?,
        width_end: r.read("WidthEnd")?,
        alpha_start: r.read("AlphaStart")?,
        alpha_end: r.read("AlphaEnd")?,
        stroke_amp: r.read("StrokeAmp")?,
        max_steps: r.read("MaxSteps")?,
        max_branches: r.read("MaxBranches")?,
        interval: r.read("Interval")?,
        per_bolts: r.read("PerBolts")?,
        circles: r.read("Circles")?,
        tail_lines: collect_tail(r)?,
    })
}

fn parse_sound_param_info(r: &mut Lines<'_>) -> Result<SoundParamInfo> {
    let sound_ver = r.read::<i32>("SoundVer")?;
    // Engine quirk: at sound_ver == 0, no separate Force2D line is
    // consumed — the SoundVer line is reused (sscanf silently fails
    // against the Force2D format, leaving 0). Replicate by skipping.
    let force_2d = if sound_ver != 0 {
        r.read::<bool>("Force2D")?
    } else {
        false
    };
    let is_loop = r.read::<bool>("IsLoop")?;
    let (volume_min, volume_max) = if sound_ver <= 1 {
        let v = r.read::<i32>("Volume")? as u32;
        (v, v)
    } else {
        (
            r.read::<i32>("VolMin")? as u32,
            r.read::<i32>("VolMax")? as u32,
        )
    };
    Ok(SoundParamInfo {
        sound_ver,
        force_2d,
        is_loop,
        volume_min,
        volume_max,
        absolute_volume: r.read_if(sound_ver >= 4, "AbsoluteVolume")?,
        pitch_min: r.read_if(sound_ver >= 2, "PitchMin")?,
        pitch_max: r.read_if(sound_ver >= 2, "PitchMax")?,
        min_dist: r.read("MinDist")?,
        max_dist: r.read("MaxDist")?,
        fix_speed: r.read_if(sound_ver >= 3, "FixSpeed")?,
        silent_header: r.read_if(sound_ver >= 5, "SilentHeader")?,
        percent_start: r.read_if(sound_ver >= 6, "PercentStart")?,
        group: r.read_if(sound_ver >= 7, "Group")?,
    })
}

fn parse_sound_audio_event(r: &mut Lines<'_>) -> Result<SoundAudioEvent> {
    Ok(SoundAudioEvent {
        event_path: r.read("Path")?,
        use_custom: r.read("UseCustom")?,
        min_dist: r.read("MinDist")?,
        max_dist: r.read("MaxDist")?,
    })
}

fn parse_sound_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    let paths = if version >= 88 {
        let n = checked_count(r.read::<i32>("PathNum")?, "Sound PathNum")?;
        (0..n)
            .map(|_| r.read::<String>("Path"))
            .collect::<Result<_>>()?
    } else {
        vec![r.read::<String>("Path")?]
    };
    Ok(ElementBody::Sound {
        paths,
        param_info: parse_sound_param_info(r)?,
        audio_event: (version >= 96)
            .then(|| parse_sound_audio_event(r))
            .transpose()?,
        tail_lines: collect_tail(r)?,
    })
}

fn parse_container_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    let gfx_path = r.read::<String>("GfxPath")?;
    let out_color = r.read_if::<bool>(version >= 47, "OutColor")?;
    let loop_flag = r.read_if::<bool>(version >= 56, "LoopFlag")?;
    let play_speed = r.read_if::<f32>(version >= 78, "PlaySpeed")?;
    let dummy_use_g_scale = r.read_if::<bool>(version >= 94, "DummyUseGScale")?;
    let tail_lines = collect_tail(r)?;
    Ok(ElementBody::Container {
        gfx_path,
        out_color,
        loop_flag,
        play_speed,
        dummy_use_g_scale,
        tail_lines,
    })
}

fn parse_trail_body(r: &mut Lines<'_>, version: u32) -> Result<ElementBody> {
    let org_pos1 = r.read::<[f32; 3]>("OrgPos1")?;
    let org_pos2 = r.read::<[f32; 3]>("OrgPos2")?;
    let enable_mat = r.read::<bool>("EnableMat")?;
    let enable_org_pos1 = r.read::<bool>("EnableOrgPos1")?;
    let enable_org_pos2 = r.read::<bool>("EnableOrgPos2")?;
    let seg_life = r.read::<i32>("SegLife")?;
    let bind = r.read_if::<bool>(version >= 18, "Bind")?;
    let spline = r.read_if::<i32>(version >= 87, "Spline")?;
    let sample_freq = r.read_if::<i32>(version >= 111, "SampleFreq")?;
    let perturb_mode = r.read_if::<i32>(version >= 122, "PerturbMode")?;
    // v>=122 + PerturbMode == 1 (eTrailPerturbMode_Spreading) emits a
    // nine-line Spreading block before the v>=123 FaceCamera field.
    let trail_perturb = if version >= 122 && perturb_mode == Some(1) {
        Some(TrailPerturbSpreading {
            disappear_speed: r.read::<f32>("DisappearSpeed")?,
            spread_speed: r.read::<f32>("SpreadSpeed")?,
            spread_seg_count: r.read::<i32>("SpreadSegCount")?,
            spread_acceleration: r.read::<f32>("SpreadAcceleration")?,
            spread_dir_min: r.read::<[f32; 3]>("SpreadDirRangeMin")?,
            spread_dir_max: r.read::<[f32; 3]>("SpreadDirRangeMax")?,
            disappear_acceleration: r.read::<f32>("DisappearAcceleration")?,
            spread_delay: r.read::<f32>("SpreadDelay")?,
            disappear_delay: r.read::<f32>("DisappearDelay")?,
        })
    } else {
        None
    };
    let face_camera = r.read_if::<bool>(version >= 123, "FaceCamera")?;
    let tail_lines = collect_tail(r)?;
    Ok(ElementBody::Trail {
        org_pos1,
        org_pos2,
        enable_mat,
        enable_org_pos1,
        enable_org_pos2,
        seg_life,
        bind,
        spline,
        sample_freq,
        perturb_mode,
        trail_perturb,
        face_camera,
        tail_lines,
    })
}

fn parse_element(r: &mut Lines<'_>, version: u32) -> Result<GfxElement> {
    let type_id = r.read::<i32>("GFXELEMENTID")? as u32;
    let element_type = GfxElementType::from_id(type_id);

    let name = r.read::<String>("Name")?;
    let src_blend = r.read::<i32>("SrcBlend")?;
    let dest_blend = r.read::<i32>("DestBlend")?;
    let repeat_count = r.read::<i32>("RepeatCount")?;
    let repeat_delay = r.read::<i32>("RepeatDelay")?;
    let tex_file = r.read::<String>("TexFile")?;

    if version >= 4 {
        r.read_value("BindEle")?;
    }

    let mut z_enable = 1_i32;
    if version >= 8 {
        z_enable = r.read::<i32>("ZEnable")?;
    }

    if version >= 22 {
        r.read::<i32>("MatchGrnd")?;
    }

    if version >= 57 {
        r.read::<i32>("GroundHeight")?;
    }

    let mut tex_row = 1_i32;
    let mut tex_col = 1_i32;
    let mut tex_interval = 0_i32;
    if version >= 9 {
        tex_row = r.read::<i32>("TexRow")?;
        tex_col = r.read::<i32>("TexCol")?;
        tex_interval = r.read::<i32>("TexInterval")?;
    }

    let mut priority = 0_i32;
    if version >= 28 {
        priority = r.read::<i32>("Priority")?;
    }

    let mut is_dummy = 0_i32;
    if version >= 32 {
        is_dummy = r.read::<i32>("IsDummy")?;
        r.read_value("DummyEle")?;
    }

    if version >= 33 {
        r.read::<i32>("Warp")?;
    }

    let mut tile_mode = 0_i32;
    if version >= 34 {
        tile_mode = r.read::<i32>("TileMode")?;
        r.read::<f32>("TexSpeed")?; // U
        r.read::<f32>("TexSpeed")?; // V
    }

    if version >= 41 {
        r.read::<i32>("UReverse")?;
        r.read::<i32>("VReverse")?;
        r.read::<i32>("UVExchg")?;
    }

    if version >= 45 {
        r.read::<i32>("RenderLayer")?;
    }

    if version >= 58 {
        r.read::<i32>("NoDownSample")?;
    }

    if version >= 74 {
        r.read::<i32>("ResetLoopEnd")?;
    }

    if version >= 75 {
        r.read::<i32>("TexAnimMaxTime")?;
    }

    let body = parse_body(r, version, &element_type)?;

    Ok(GfxElement {
        type_id,
        name,
        src_blend,
        dest_blend,
        repeat_count,
        repeat_delay,
        tex_file,
        tex_row,
        tex_col,
        tex_interval,
        tile_mode,
        z_enable,
        is_dummy,
        priority,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_gfx_v58_header(element_count: usize) -> String {
        // v58 activates: DedaultScale(16), PlaySpeed(17), DefaultAlpha(18),
        // Raytrace(23), FaceToViewer(38), FadeByDist/FadeStart/FadeEnd(27),
        // Vec x2(25), UseAABB(53), ShakeCam(24), NoChangeDir(46),
        // 2DRender/2DBackLayer(50)
        // NOT active: IsAngelica3(89), AccurateAABB(84), ShakeDamp(82),
        //             PhysExist(63 — version 58 < 63)
        let mut s = String::new();
        s.push_str("Version: 58\r\n");
        s.push_str("DedaultScale: 1.000000\r\n");
        s.push_str("PlaySpeed: 1.000000\r\n");
        s.push_str("DefaultAlpha: 1.000000\r\n");
        s.push_str("Raytrace: 0\r\n");
        s.push_str("FaceToViewer: 0\r\n");
        s.push_str("FadeByDist: 0\r\n");
        s.push_str("FadeStart: 0.000000\r\n");
        s.push_str("FadeEnd: 100.000000\r\n");
        s.push_str("Vec: 0.000000, 0.000000, 0.000000\r\n");
        s.push_str("Vec: 1.000000, 1.000000, 1.000000\r\n");
        s.push_str("UseAABB: 0\r\n");
        s.push_str("ShakeCam: 0\r\n");
        s.push_str("NoChangeDir: 0\r\n");
        s.push_str("2DRender: 0\r\n");
        s.push_str("2DBackLayer: 0\r\n");
        s.push_str(&format!("GFXELEMENTCOUNT: {}\r\n", element_count));
        s
    }

    fn make_element_v58(type_id: u32, name: &str, extra_body: &str) -> String {
        // v58 activates: BindEle(4), ZEnable(8), MatchGrnd(22), GroundHeight(57),
        // TexRow/Col/Interval(9), Priority(28), IsDummy/DummyEle(32),
        // Warp(33), TileMode/TexSpeed x2(34), UReverse/VReverse/UVExchg(41),
        // RenderLayer(45), NoDownSample(58)
        // NOT active: ResetLoopEnd(74), TexAnimMaxTime(75), pixel shader(95),
        //             CanDoFadeOut(92)
        let mut s = String::new();
        s.push_str(&format!("GFXELEMENTID: {}\r\n", type_id));
        s.push_str(&format!("Name: {}\r\n", name));
        s.push_str("SrcBlend: 5\r\n");
        s.push_str("DestBlend: 6\r\n");
        s.push_str("RepeatCount: 1\r\n");
        s.push_str("RepeatDelay: 0\r\n");
        s.push_str("TexFile: particle.dds\r\n");
        s.push_str("BindEle: \r\n");
        s.push_str("ZEnable: 1\r\n");
        s.push_str("MatchGrnd: 0\r\n");
        s.push_str("GroundHeight: 0\r\n");
        s.push_str("TexRow: 1\r\n");
        s.push_str("TexCol: 1\r\n");
        s.push_str("TexInterval: 100\r\n");
        s.push_str("Priority: 0\r\n");
        s.push_str("IsDummy: 0\r\n");
        s.push_str("DummyEle: \r\n");
        s.push_str("Warp: 0\r\n");
        s.push_str("TileMode: 0\r\n");
        s.push_str("TexSpeed: 0.000000\r\n");
        s.push_str("TexSpeed: 0.000000\r\n");
        s.push_str("UReverse: 0\r\n");
        s.push_str("VReverse: 0\r\n");
        s.push_str("UVExchg: 0\r\n");
        s.push_str("RenderLayer: 0\r\n");
        s.push_str("NoDownSample: 0\r\n");
        s.push_str(extra_body);
        s
    }

    #[test]
    fn parse_empty_gfx() {
        let input = make_gfx_v58_header(0);
        let effect = GfxEffect::parse(input.as_bytes()).unwrap();

        assert_eq!(effect.version, 58);
        assert!((effect.default_scale - 1.0).abs() < 1e-6);
        assert!((effect.play_speed - 1.0).abs() < 1e-6);
        assert!((effect.default_alpha - 1.0).abs() < 1e-6);
        assert_eq!(effect.face_to_viewer, 0);
        assert_eq!(effect.fade_by_dist, 0);
        assert!(effect.aabb_min.is_some());
        assert!(effect.aabb_max.is_some());
        assert_eq!(effect.use_aabb, 0);
        assert!(effect.elements.is_empty());
    }

    #[test]
    fn parse_gfx_with_one_element() {
        // Type 230 (EcModel) has no typed parser — fake body text survives
        // as `ElementBody::Unknown` raw lines.
        let mut input = make_gfx_v58_header(1);
        input.push_str(&make_element_v58(
            230,
            "fire_particle",
            "EmitSpeed: 3.0\r\n",
        ));

        let effect = GfxEffect::parse(input.as_bytes()).unwrap();

        assert_eq!(effect.version, 58);
        assert_eq!(effect.elements.len(), 1);

        let elem = &effect.elements[0];
        assert_eq!(elem.type_id, 230);
        assert_eq!(elem.name, "fire_particle");
        assert_eq!(elem.src_blend, 5);
        assert_eq!(elem.dest_blend, 6);
        assert_eq!(elem.repeat_count, 1);
        assert_eq!(elem.tex_file, "particle.dds");
        assert_eq!(elem.tex_row, 1);
        assert_eq!(elem.tex_col, 1);
        assert_eq!(elem.tex_interval, 100);
        assert_eq!(elem.z_enable, 1);
        assert_eq!(elem.is_dummy, 0);
        assert_eq!(elem.priority, 0);
        let ElementBody::Unknown { lines } = &elem.body else {
            panic!("expected unknown body for type 230");
        };
        assert_eq!(lines, &vec!["EmitSpeed: 3.0".to_string()]);
    }

    #[test]
    fn parse_gfx_multiple_elements() {
        // Use types with Unknown dispatch (230 EcModel, 180 LtnTrail) so
        // fake body text flows through as raw lines.
        let mut input = make_gfx_v58_header(2);
        input.push_str(&make_element_v58(
            230,
            "ec_a",
            "EmitSpeed: 1.0\r\nLifeTime: 2.0\r\n",
        ));
        input.push_str(&make_element_v58(180, "ltn_trail_b", "Width: 0.5\r\n"));

        let effect = GfxEffect::parse(input.as_bytes()).unwrap();

        assert_eq!(effect.elements.len(), 2);

        let e0 = &effect.elements[0];
        assert_eq!(e0.type_id, 230);
        assert_eq!(e0.name, "ec_a");
        let ElementBody::Unknown { lines } = &e0.body else {
            panic!("expected unknown body for type 230");
        };
        assert_eq!(
            lines,
            &vec!["EmitSpeed: 1.0".to_string(), "LifeTime: 2.0".to_string()]
        );

        let e1 = &effect.elements[1];
        assert_eq!(e1.type_id, 180);
        assert_eq!(e1.name, "ltn_trail_b");
        let ElementBody::Unknown { lines } = &e1.body else {
            panic!("expected unknown body for type 180");
        };
        assert_eq!(lines, &vec!["Width: 0.5".to_string()]);
    }

    #[test]
    fn parse_accepts_default_scale_spelling() {
        // Late engine versions fixed the "Dedault" typo — both spellings coexist
        // across archive files.
        let input = make_gfx_v58_header(0).replace("DedaultScale:", "DefaultScale:");
        let effect = GfxEffect::parse(input.as_bytes()).unwrap();
        assert!((effect.default_scale - 1.0).abs() < 1e-6);
    }

    #[test]
    fn parse_reads_skip_time_when_present() {
        // Some engine variants emit `SkipTime:` between 2DBackLayer and
        // PhysExist earlier than the stock v≥112 gate.
        let header = make_gfx_v58_header(0)
            .replace("2DBackLayer: 0\r\n", "2DBackLayer: 0\r\nSkipTime: 0\r\n");
        let effect = GfxEffect::parse(header.as_bytes()).unwrap();
        assert_eq!(effect.version, 58);
        assert!(effect.elements.is_empty());
    }

    #[test]
    fn parse_decal_body_v58() {
        // v58 Decal3D. Engine gates: v>=26 GrndNormOnly, v>=36 NoScale×2
        // + OrgPt×2, v>=42 ZOffset, v>=54 MatchSurface, v>=55 MaxExtent,
        // v>=61 YawEffect (not at v58), v>=86 SurfaceUseParentDir (not
        // at v58).
        let mut input = make_gfx_v58_header(1);
        input.push_str(&make_element_v58(
            100,
            "ground_decal",
            concat!(
                "Width: 2.500000\r\n",
                "Height: 1.750000\r\n",
                "RotFromView: 1\r\n",
                "GrndNormOnly: 0\r\n",
                "NoScale: 0\r\n",
                "NoScale: 1\r\n",
                "OrgPt: 0.500000\r\n",
                "OrgPt: 0.750000\r\n",
                "ZOffset: 0.010000\r\n",
                "MatchSurface: 1\r\n",
                "MaxExtent: 50.000000\r\n",
                "AffectorCount: 0\r\n",
            ),
        ));

        let effect = GfxEffect::parse(input.as_bytes()).unwrap();
        assert_eq!(effect.elements.len(), 1);
        let ElementBody::Decal {
            width,
            height,
            rot_from_view,
            grnd_norm_only,
            no_scale,
            org_pt,
            z_offset,
            match_surface,
            surface_use_parent_dir,
            max_extent,
            yaw_effect,
            screen_space,
            tail_lines,
        } = &effect.elements[0].body
        else {
            panic!("expected decal body");
        };
        assert!((width - 2.5).abs() < 1e-6);
        assert!((height - 1.75).abs() < 1e-6);
        assert!(*rot_from_view);
        assert_eq!(*grnd_norm_only, Some(false));
        assert_eq!(*no_scale, Some((false, true)));
        assert_eq!(*org_pt, Some((0.5, 0.75)));
        assert_eq!(*z_offset, Some(0.01));
        assert_eq!(*match_surface, Some(true));
        assert_eq!(*max_extent, Some(50.0));
        assert_eq!(*surface_use_parent_dir, None);
        assert_eq!(*yaw_effect, None);
        assert_eq!(*screen_space, None);
        assert_eq!(tail_lines, &vec!["AffectorCount: 0"]);
    }

    #[test]
    fn parse_trail_body_v58() {
        // v58 Trail. No gates for fixed fields; v>=18 Bind (yes at v58),
        // v>=87 Spline (no at v58).
        let mut input = make_gfx_v58_header(1);
        input.push_str(&make_element_v58(
            110,
            "sword_trail",
            concat!(
                "OrgPos1: 0.000000, 0.000000, 0.000000\r\n",
                "OrgPos2: 0.000000, 0.800000, 0.000000\r\n",
                "EnableMat: 1\r\n",
                "EnableOrgPos1: 1\r\n",
                "EnableOrgPos2: 1\r\n",
                "SegLife: 300\r\n",
                "Bind: 1\r\n",
                "AffectorCount: 0\r\n",
            ),
        ));

        let effect = GfxEffect::parse(input.as_bytes()).unwrap();
        let ElementBody::Trail {
            org_pos1,
            org_pos2,
            enable_mat,
            enable_org_pos1,
            enable_org_pos2,
            seg_life,
            bind,
            spline,
            tail_lines,
            ..
        } = &effect.elements[0].body
        else {
            panic!("expected trail body");
        };
        assert_eq!(*org_pos1, [0.0, 0.0, 0.0]);
        assert_eq!(*org_pos2, [0.0, 0.8, 0.0]);
        assert!(*enable_mat);
        assert!(*enable_org_pos1);
        assert!(*enable_org_pos2);
        assert_eq!(*seg_life, 300);
        assert_eq!(*bind, Some(true));
        assert_eq!(*spline, None);
        assert_eq!(tail_lines, &vec!["AffectorCount: 0"]);
    }

    #[test]
    fn parse_container_body_v58() {
        // v58 GfxContainer: GfxPath (always), OutColor (v>=47), LoopFlag
        // (v>=56), PlaySpeed (v>=78, not at v58), DummyUseGfxScale (v>=94).
        let mut input = make_gfx_v58_header(1);
        input.push_str(&make_element_v58(
            200,
            "nested_fx",
            concat!(
                "GfxPath: sub\\sparkle.gfx\r\n",
                "OutColor: 1\r\n",
                "LoopFlag: 0\r\n",
                "AffectorCount: 0\r\n",
            ),
        ));
        let effect = GfxEffect::parse(input.as_bytes()).unwrap();
        let ElementBody::Container {
            gfx_path,
            out_color,
            loop_flag,
            play_speed,
            dummy_use_g_scale,
            ..
        } = &effect.elements[0].body
        else {
            panic!("expected container body");
        };
        assert_eq!(gfx_path, "sub\\sparkle.gfx");
        assert_eq!(*out_color, Some(true));
        assert_eq!(*loop_flag, Some(false));
        assert_eq!(*play_speed, None);
        assert_eq!(*dummy_use_g_scale, None);
    }

    #[test]
    fn parse_ring_body_v58() {
        // v58 Ring: Radius/Height/Pitch (always), v>=14 Sects/NoRadScale/
        // NoHeiScale, v>=15 OrgAtCenter.
        let mut input = make_gfx_v58_header(1);
        input.push_str(&make_element_v58(
            140,
            "shockwave",
            concat!(
                "Radius: 2.500000\r\n",
                "Height: 0.250000\r\n",
                "Pitch: 0.000000\r\n",
                "Sects: 32\r\n",
                "NoRadScale: 0\r\n",
                "NoHeiScale: 0\r\n",
                "OrgAtCenter: 1\r\n",
                "AffectorCount: 0\r\n",
            ),
        ));
        let effect = GfxEffect::parse(input.as_bytes()).unwrap();
        let ElementBody::Ring {
            radius,
            height,
            sects,
            org_at_center,
            ..
        } = &effect.elements[0].body
        else {
            panic!("expected ring body");
        };
        assert!((radius - 2.5).abs() < 1e-6);
        assert!((height - 0.25).abs() < 1e-6);
        assert_eq!(*sects, Some(32));
        assert_eq!(*org_at_center, Some(true));
    }

    #[test]
    fn parse_particle_body_v58_box_emitter() {
        // v58 ParticleBox. Header has ScaleNoOff (v>=30) and NoScale×2 +
        // OrgPt×2 (v>=37). Emitter has ParAcc (v>=20), ScaleMin/Max (v>=2),
        // RotMin/Max (v>=10), IsDrag (v>=43), DragPow (v>=48). Box shape
        // adds AreaSize.
        let mut input = make_gfx_v58_header(1);
        input.push_str(&make_element_v58(
            121,
            "spark_box",
            concat!(
                // Particle header
                "Quota: 100\r\n",
                "ParticleWidth: 0.200000\r\n",
                "ParticleHeight: 0.300000\r\n",
                "3DParticle: 0\r\n",
                "Facing: 0\r\n",
                "ScaleNoOff: 0\r\n",
                "NoScale: 0\r\n",
                "NoScale: 0\r\n",
                "OrgPt: 0.500000\r\n",
                "OrgPt: 0.500000\r\n",
                // Emitter — shared
                "EmissionRate: 25.000000\r\n",
                "Angle: 45.000000\r\n",
                "Speed: 2.000000\r\n",
                "ParAcc: 0.000000\r\n",
                "AccDir: 0.000000, -1.000000, 0.000000\r\n",
                "Acc: 9.800000\r\n",
                "TTL: 1.500000\r\n",
                "ColorMin: -1\r\n",
                "ColorMax: -1\r\n",
                "ScaleMin: 0.100000\r\n",
                "ScaleMax: 0.400000\r\n",
                "RotMin: 0.000000\r\n",
                "RotMax: 6.283185\r\n",
                "IsSurface: 0\r\n",
                "IsBind: 0\r\n",
                "IsDrag: 0\r\n",
                "DragPow: 1.000000\r\n",
                // Box shape
                "AreaSize: 1.000000, 0.500000, 2.000000\r\n",
                // Affector count boundary
                "AffectorCount: 0\r\n",
            ),
        ));
        let effect = GfxEffect::parse(input.as_bytes()).unwrap();
        let ElementBody::Particle {
            quota,
            particle_width,
            scale_no_off,
            no_scale,
            emitter,
            tail_lines,
            ..
        } = &effect.elements[0].body
        else {
            panic!("expected particle body");
        };
        assert_eq!(*quota, 100);
        assert!((particle_width - 0.2).abs() < 1e-6);
        assert_eq!(*scale_no_off, Some(false));
        assert_eq!(*no_scale, Some((false, false)));
        assert!((emitter.emission_rate - 25.0).abs() < 1e-6);
        assert!((emitter.ttl - 1.5).abs() < 1e-6);
        assert_eq!(emitter.color_min, 0xFFFFFFFF);
        assert_eq!(emitter.color_max, 0xFFFFFFFF);
        assert!((emitter.scale_min - 0.1).abs() < 1e-6);
        let EmitterShape::Box { area_size } = emitter.shape else {
            panic!("expected Box emitter shape");
        };
        assert_eq!(area_size, [1.0, 0.5, 2.0]);
        assert_eq!(tail_lines, &vec!["AffectorCount: 0"]);
    }

    fn make_lines(body: &str) -> Lines<'_> {
        Lines::new(body)
    }

    #[test]
    fn parse_decal_body_v115_reads_screen_space() {
        // v>=115 activates `ScreenSpace: %d` after `YawEffect`.
        let input = concat!(
            "Width: 1.000000\r\n",
            "Height: 1.000000\r\n",
            "RotFromView: 0\r\n",
            "GrndNormOnly: 0\r\n",
            "NoScale: 0\r\n",
            "NoScale: 0\r\n",
            "OrgPt: 0.500000\r\n",
            "OrgPt: 0.500000\r\n",
            "ZOffset: 0.000000\r\n",
            "MatchSurface: 0\r\n",
            "SurfaceUseParentDir: 0\r\n",
            "MaxExtent: 0.000000\r\n",
            "YawEffect: 0\r\n",
            "ScreenSpace: 1\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_decal_body(&mut r, 115).unwrap();
        let ElementBody::Decal { screen_space, .. } = body else {
            panic!("expected decal body");
        };
        assert_eq!(screen_space, Some(true));
    }

    #[test]
    fn parse_trail_body_v122_with_spreading_perturb() {
        // v>=122 + PerturbMode == 1 emits the nine-line Spreading block
        // between PerturbMode and FaceCamera.
        let input = concat!(
            "OrgPos1: 0.000000, 0.000000, 0.000000\r\n",
            "OrgPos2: 0.000000, 1.000000, 0.000000\r\n",
            "EnableMat: 1\r\n",
            "EnableOrgPos1: 1\r\n",
            "EnableOrgPos2: 1\r\n",
            "SegLife: 300\r\n",
            "Bind: 1\r\n",
            "Spline: 0\r\n",
            "SampleFreq: 5\r\n",
            "PerturbMode: 1\r\n",
            "DisappearSpeed: 1.500000\r\n",
            "SpreadSpeed: 2.000000\r\n",
            "SpreadSegCount: 3\r\n",
            "SpreadAcceleration: 0.250000\r\n",
            "SpreadDirRangeMin: -1.000000, -0.500000, -0.250000\r\n",
            "SpreadDirRangeMax: 1.000000, 0.500000, 0.250000\r\n",
            "DisappearAcceleration: -0.125000\r\n",
            "SpreadDelay: 0.050000\r\n",
            "DisappearDelay: 0.100000\r\n",
            "FaceCamera: 1\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_trail_body(&mut r, 123).unwrap();
        let ElementBody::Trail {
            perturb_mode,
            trail_perturb,
            face_camera,
            ..
        } = body
        else {
            panic!("expected trail body");
        };
        assert_eq!(perturb_mode, Some(1));
        let p = trail_perturb.expect("expected Spreading perturb block");
        assert!((p.disappear_speed - 1.5).abs() < 1e-6);
        assert!((p.spread_speed - 2.0).abs() < 1e-6);
        assert_eq!(p.spread_seg_count, 3);
        assert!((p.spread_acceleration - 0.25).abs() < 1e-6);
        assert_eq!(p.spread_dir_min, [-1.0, -0.5, -0.25]);
        assert_eq!(p.spread_dir_max, [1.0, 0.5, 0.25]);
        assert!((p.disappear_acceleration - -0.125).abs() < 1e-6);
        assert!((p.spread_delay - 0.05).abs() < 1e-6);
        assert!((p.disappear_delay - 0.1).abs() < 1e-6);
        assert_eq!(face_camera, Some(true));
    }

    #[test]
    fn parse_trail_body_v122_perturb_mode_zero_skips_spreading() {
        // v>=122 but PerturbMode != 1 → no Spreading block; parser
        // proceeds directly to FaceCamera.
        let input = concat!(
            "OrgPos1: 0.000000, 0.000000, 0.000000\r\n",
            "OrgPos2: 0.000000, 1.000000, 0.000000\r\n",
            "EnableMat: 0\r\n",
            "EnableOrgPos1: 0\r\n",
            "EnableOrgPos2: 0\r\n",
            "SegLife: 100\r\n",
            "Bind: 0\r\n",
            "Spline: 0\r\n",
            "SampleFreq: 5\r\n",
            "PerturbMode: 0\r\n",
            "FaceCamera: 0\r\n",
        );
        let mut r = make_lines(input);
        let body = super::parse_trail_body(&mut r, 123).unwrap();
        let ElementBody::Trail {
            perturb_mode,
            trail_perturb,
            face_camera,
            ..
        } = body
        else {
            panic!("expected trail body");
        };
        assert_eq!(perturb_mode, Some(0));
        assert!(trail_perturb.is_none());
        assert_eq!(face_camera, Some(false));
    }

    #[test]
    fn parse_reads_skip_time_followed_by_phys_exist() {
        // Verify SkipTime + PhysExist read in order when both are present
        // (v≥63 activates the PhysExist gate).
        let header = make_gfx_v58_header(0)
            .replace("Version: 58", "Version: 63")
            .replace(
                "2DBackLayer: 0\r\n",
                "2DBackLayer: 0\r\nSkipTime: 0\r\nPhysExist: 0\r\n",
            );
        let effect = GfxEffect::parse(header.as_bytes()).unwrap();
        assert_eq!(effect.version, 63);
        assert!(effect.elements.is_empty());
    }
}
