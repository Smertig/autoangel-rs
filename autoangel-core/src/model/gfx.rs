use crate::model::common::decode_gbk;
use crate::model::text_reader::Lines;
use eyre::{Result, eyre};

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
#[derive(Debug, Clone)]
pub struct GfxElement {
    pub element_type: GfxElementType,
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
    /// Unparsed element-type-specific lines collected after the base header.
    pub body_lines: Vec<String>,
}

/// A parsed GFX visual effect container.
#[derive(Debug, Clone)]
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
            r.read_int("IsAngelica3")?;
        }

        let mut default_scale = 1.0_f32;
        if version >= 16 {
            default_scale = r.read_float("DedaultScale")?;
        }

        let mut play_speed = 1.0_f32;
        if version >= 17 {
            play_speed = r.read_float("PlaySpeed")?;
        }

        let mut default_alpha = 1.0_f32;
        if version >= 18 {
            default_alpha = r.read_float("DefaultAlpha")?;
        }

        if version >= 23 {
            r.read_int("Raytrace")?;
        }

        let mut face_to_viewer = 0_i32;
        if version >= 38 {
            face_to_viewer = r.read_int("FaceToViewer")?;
        }

        let mut fade_by_dist = 0_i32;
        let mut fade_start = 0.0_f32;
        let mut fade_end = 0.0_f32;
        if version >= 27 {
            fade_by_dist = r.read_int("FadeByDist")?;
            fade_start = r.read_float("FadeStart")?;
            fade_end = r.read_float("FadeEnd")?;
        }

        let mut aabb_min: Option<[f32; 3]> = None;
        let mut aabb_max: Option<[f32; 3]> = None;
        if version >= 25 {
            aabb_min = Some(r.read_vec3("Vec")?);
            aabb_max = Some(r.read_vec3("Vec")?);
        }

        let mut use_aabb = 0_i32;
        if version >= 53 {
            use_aabb = r.read_int("UseAABB")?;
        }

        if version >= 84 {
            r.read_int("AccurateAABB")?;
        }

        if version >= 24 {
            let shake_cam = r.read_int("ShakeCam")?;
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
            r.read_int("ShakeDamp")?;
        }

        if version >= 46 {
            r.read_int("NoChangeDir")?;
        }

        if version >= 50 {
            r.read_int("2DRender")?;
            r.read_int("2DBackLayer")?;
        }

        if version >= 63 {
            r.read_int("PhysExist")?;
        }

        let element_count = r.read_int("GFXELEMENTCOUNT")? as usize;
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

/// Keys that terminate the pixel shader skip block — either next element or CanDoFadeOut.
const PIXEL_SHADER_TERMINATORS: &[&str] = &["CanDoFadeOut", "GFXELEMENTID"];

fn parse_element(r: &mut Lines<'_>, version: u32) -> Result<GfxElement> {
    let type_id = r.read_int("GFXELEMENTID")? as u32;
    let element_type = GfxElementType::from_id(type_id);

    let name = r.read_value("Name")?.to_string();
    let src_blend = r.read_int("SrcBlend")?;
    let dest_blend = r.read_int("DestBlend")?;
    let repeat_count = r.read_int("RepeatCount")?;
    let repeat_delay = r.read_int("RepeatDelay")?;
    let tex_file = r.read_value("TexFile")?.to_string();

    if version >= 4 {
        r.read_value("BindEle")?;
    }

    let mut z_enable = 1_i32;
    if version >= 8 {
        z_enable = r.read_int("ZEnable")?;
    }

    if version >= 22 {
        r.read_int("MatchGrnd")?;
    }

    if version >= 57 {
        r.read_int("GroundHeight")?;
    }

    let mut tex_row = 1_i32;
    let mut tex_col = 1_i32;
    let mut tex_interval = 0_i32;
    if version >= 9 {
        tex_row = r.read_int("TexRow")?;
        tex_col = r.read_int("TexCol")?;
        tex_interval = r.read_int("TexInterval")?;
    }

    let mut priority = 0_i32;
    if version >= 28 {
        priority = r.read_int("Priority")?;
    }

    let mut is_dummy = 0_i32;
    if version >= 32 {
        is_dummy = r.read_int("IsDummy")?;
        r.read_value("DummyEle")?;
    }

    if version >= 33 {
        r.read_int("Warp")?;
    }

    let mut tile_mode = 0_i32;
    if version >= 34 {
        tile_mode = r.read_int("TileMode")?;
        r.read_float("TexSpeed")?; // U
        r.read_float("TexSpeed")?; // V
    }

    if version >= 41 {
        r.read_int("UReverse")?;
        r.read_int("VReverse")?;
        r.read_int("UVExchg")?;
    }

    if version >= 45 {
        r.read_int("RenderLayer")?;
    }

    if version >= 58 {
        r.read_int("NoDownSample")?;
    }

    if version >= 74 {
        r.read_int("ResetLoopEnd")?;
    }

    if version >= 75 {
        r.read_int("TexAnimMaxTime")?;
    }

    if version >= 95 {
        // Skip complex pixel shader block until CanDoFadeOut or next element.
        while !r.done() {
            if let Some(k) = r.peek_key()
                && PIXEL_SHADER_TERMINATORS.contains(&k)
            {
                break;
            }
            r.next_line()?;
        }
    }

    if version >= 92 {
        r.read_int("CanDoFadeOut")?;
    }

    // Collect all remaining element-body lines until the next element or EOF.
    let mut body_lines = Vec::new();
    while !r.done() && r.peek_key() != Some("GFXELEMENTID") {
        body_lines.push(r.next_line()?.to_string());
    }

    Ok(GfxElement {
        element_type,
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
        body_lines,
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
        let mut input = make_gfx_v58_header(1);
        input.push_str(&make_element_v58(
            120,
            "fire_particle",
            "EmitSpeed: 3.0\r\n",
        ));

        let effect = GfxEffect::parse(input.as_bytes()).unwrap();

        assert_eq!(effect.version, 58);
        assert_eq!(effect.elements.len(), 1);

        let elem = &effect.elements[0];
        assert_eq!(elem.element_type, GfxElementType::ParticlePoint);
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
        assert_eq!(elem.body_lines, vec!["EmitSpeed: 3.0"]);
    }

    #[test]
    fn parse_gfx_multiple_elements() {
        let mut input = make_gfx_v58_header(2);
        input.push_str(&make_element_v58(
            120,
            "particle_a",
            "EmitSpeed: 1.0\r\nLifeTime: 2.0\r\n",
        ));
        input.push_str(&make_element_v58(110, "trail_b", "Width: 0.5\r\n"));

        let effect = GfxEffect::parse(input.as_bytes()).unwrap();

        assert_eq!(effect.elements.len(), 2);

        let e0 = &effect.elements[0];
        assert_eq!(e0.element_type, GfxElementType::ParticlePoint);
        assert_eq!(e0.name, "particle_a");
        assert_eq!(e0.body_lines, vec!["EmitSpeed: 1.0", "LifeTime: 2.0"]);

        let e1 = &effect.elements[1];
        assert_eq!(e1.element_type, GfxElementType::Trail);
        assert_eq!(e1.name, "trail_b");
        assert_eq!(e1.body_lines, vec!["Width: 0.5"]);
    }
}
