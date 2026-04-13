use crate::model::common::decode_gbk;
use eyre::{Result, eyre};

#[derive(Debug, Clone, Default)]
pub struct BoneScaleEntry {
    pub bone_index: i32,
    /// Old format: (scale_x, scale_y, scale_z). New (BoneScaleEx): (len, thick, whole).
    pub scale: [f32; 3],
    /// `Some(type)` for old format, `None` for BoneScaleEx.
    pub scale_type: Option<i32>,
}

#[derive(Debug, Clone, Default)]
pub struct ChildModel {
    pub name: String,
    pub path: String,
    pub hh_name: String,
    pub cc_name: String,
}

#[derive(Debug, Clone)]
pub struct EcmModel {
    pub version: u32,
    pub skin_model_path: String,
    pub additional_skins: Vec<String>,
    pub org_color: u32,
    pub src_blend: i32,
    pub dest_blend: i32,
    pub outer_floats: Vec<f32>,
    pub new_bone_scale: bool,
    pub bone_scales: Vec<BoneScaleEntry>,
    pub scale_base_bone: Option<String>,
    pub def_play_speed: f32,
    pub child_models: Vec<ChildModel>,
}

/// Line-by-line positional reader. Consumes lines in order.
struct Lines<'a> {
    lines: Vec<&'a str>,
    pos: usize,
}

impl<'a> Lines<'a> {
    fn new(text: &'a str) -> Self {
        Lines {
            lines: text.lines().collect(),
            pos: 0,
        }
    }

    fn done(&self) -> bool {
        self.pos >= self.lines.len()
    }

    /// Read next line, trimming whitespace.
    fn next_line(&mut self) -> Result<&'a str> {
        if self.pos >= self.lines.len() {
            eyre::bail!("Unexpected end of ECM at line {}", self.pos);
        }
        let line = self.lines[self.pos].trim();
        self.pos += 1;
        Ok(line)
    }

    /// Read next line, parse as "Key: Value", return value.
    fn read_value(&mut self, expected_key: &str) -> Result<&'a str> {
        let line = self.next_line()?;
        let (k, v) = split_kv(line).ok_or_else(|| {
            eyre!(
                "Expected '{}:', got '{}' at line {}",
                expected_key,
                line,
                self.pos - 1
            )
        })?;
        if k != expected_key {
            eyre::bail!(
                "Expected '{}:', got '{}:' at line {}",
                expected_key,
                k,
                self.pos - 1
            );
        }
        Ok(v)
    }

    fn read_int(&mut self, key: &str) -> Result<i32> {
        let v = self.read_value(key)?;
        v.parse()
            .map_err(|_| eyre!("Invalid int for '{}': '{}'", key, v))
    }

    fn read_hex_u32(&mut self, key: &str) -> Result<u32> {
        let v = self.read_value(key)?;
        u32::from_str_radix(v, 16).map_err(|_| eyre!("Invalid hex for '{}': '{}'", key, v))
    }

    fn read_float(&mut self, key: &str) -> Result<f32> {
        let v = self.read_value(key)?;
        v.parse()
            .map_err(|_| eyre!("Invalid float for '{}': '{}'", key, v))
    }

    fn read_vec3(&mut self, key: &str) -> Result<[f32; 3]> {
        let v = self.read_value(key)?;
        parse_vec3(v)
    }

    /// Peek at the key of the current line without consuming it.
    fn peek_key(&self) -> Option<&str> {
        self.lines
            .get(self.pos)
            .and_then(|l| split_kv(l.trim()).map(|(k, _)| k))
    }
}

/// Split "Key: Value" into (key, value). Handles empty values like "Key: " or "Key:".
fn split_kv(line: &str) -> Option<(&str, &str)> {
    if let Some((k, v)) = line.split_once(": ") {
        Some((k.trim(), v.trim()))
    } else {
        let k = line.strip_suffix(':')?;
        Some((k.trim(), ""))
    }
}

fn parse_vec3(s: &str) -> Result<[f32; 3]> {
    let (a, rest) = s
        .split_once(',')
        .ok_or_else(|| eyre!("Expected 3 floats: '{s}'"))?;
    let (b, c) = rest
        .split_once(',')
        .ok_or_else(|| eyre!("Expected 3 floats: '{s}'"))?;
    Ok([
        a.trim()
            .parse()
            .map_err(|_| eyre!("Invalid float: '{}'", a.trim()))?,
        b.trim()
            .parse()
            .map_err(|_| eyre!("Invalid float: '{}'", b.trim()))?,
        c.trim()
            .parse()
            .map_err(|_| eyre!("Invalid float: '{}'", c.trim()))?,
    ])
}

impl EcmModel {
    pub fn parse(data: &[u8]) -> Result<Self> {
        let text = decode_gbk(data)?;
        let mut r = Lines::new(&text);

        // Line 1: "Version: %d" or "MOXTVersion: %d"
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

        // Line 2: "SkinModelPath: %s"
        let skin_model_path = r.read_value("SkinModelPath")?.to_string();

        let mut org_color = 0xFFFFFFFF_u32;
        let mut src_blend = 5_i32;
        let mut dest_blend = 6_i32;
        let mut outer_floats = Vec::new();
        let mut new_bone_scale = false;
        let mut bone_scales = Vec::new();
        let mut scale_base_bone: Option<String> = None;
        let mut def_play_speed = 1.0_f32;
        let mut additional_skins = Vec::new();
        let mut child_models = Vec::new();

        if version >= 33 && r.peek_key() == Some("AutoUpdata") {
            r.read_int("AutoUpdata")?;
        }

        if version >= 16 {
            org_color = r.read_hex_u32("OrgColor")?;

            if version >= 52 {
                r.read_hex_u32("EmissiveCol")?;
            }
            if version >= 21 {
                src_blend = r.read_int("SrcBlend")?;
                dest_blend = r.read_int("DestBlend")?;
            }

            let outer_num = r.read_int("OuterNum")? as usize;
            for _ in 0..outer_num {
                outer_floats.push(r.read_float("Float")?);
            }

            if version >= 28 {
                new_bone_scale = r.read_int("NewScale")? != 0;
            }

            let bone_num = r.read_int("BoneNum")? as usize;
            for _ in 0..bone_num {
                let bone_index = r.read_int("BoneIndex")?;
                if new_bone_scale {
                    let scale = r.read_vec3("BoneScale")?;
                    bone_scales.push(BoneScaleEntry {
                        bone_index,
                        scale,
                        scale_type: None,
                    });
                } else {
                    let scale_type = r.read_int("BoneSclType")?;
                    let scale = r.read_vec3("BoneScale")?;
                    bone_scales.push(BoneScaleEntry {
                        bone_index,
                        scale,
                        scale_type: Some(scale_type),
                    });
                }
            }

            if version >= 29 {
                // ScaleBaseBone is a RAW LINE — no key prefix
                let raw = r.next_line()?;
                if !raw.is_empty() {
                    scale_base_bone = Some(raw.to_string());
                }
            }
        }

        if version >= 27 {
            def_play_speed = r.read_float("DefSpeed")?;
        }
        if version >= 43 {
            r.read_int("CanCastShadow")?;
        }
        if version >= 45 {
            r.read_int("RenderModel")?;
        }
        if version >= 48 {
            r.read_int("RenderEdge")?;
        }

        // Everything between here and AddiSkinCount varies greatly by version:
        // pixel shader fields (v >= 57), ChannelCount/ChannelMask blocks, CoGfx
        // entries (full GFX event blocks), and combined actions (format differs
        // between v21 and v67+). The spec says to skip combined actions and
        // CoGfx for rendering. Scan forward to AddiSkinCount by key.
        while !r.done() {
            if r.peek_key() == Some("AddiSkinCount") {
                break;
            }
            r.next_line()?;
        }

        // Additional skins
        if !r.done() && r.peek_key() == Some("AddiSkinCount") {
            let addi_count = r.read_int("AddiSkinCount")? as usize;
            for _ in 0..addi_count {
                additional_skins.push(r.read_value("AddiSkinPath")?.to_string());
            }
        }

        // Child models
        if !r.done() && r.peek_key() == Some("ChildCount") {
            let child_count = r.read_int("ChildCount")? as usize;
            for _ in 0..child_count {
                child_models.push(ChildModel {
                    name: r.read_value("ChildName")?.to_string(),
                    path: r.read_value("ChildPath")?.to_string(),
                    hh_name: r.read_value("HHName")?.to_string(),
                    cc_name: r.read_value("CCName")?.to_string(),
                });
            }
        }

        Ok(EcmModel {
            version,
            skin_model_path,
            additional_skins,
            org_color,
            src_blend,
            dest_blend,
            outer_floats,
            new_bone_scale,
            bone_scales,
            scale_base_bone,
            def_play_speed,
            child_models,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::include_test_data_bytes;

    #[test]
    fn parse_version_line() {
        let data = b"Version: 21\nSkinModelPath: test.SMD\nOrgColor: ffffffff\nSrcBlend: 5\nDestBlend: 6\nOuterNum: 0\nBoneNum: 0\nCoGfxNum: 0\nComActCount: 0\nAddiSkinCount: 0\n";
        let ecm = EcmModel::parse(data).unwrap();
        assert_eq!(ecm.version, 21);
    }

    #[test]
    fn parse_moxt_version_line() {
        let data = b"MOXTVersion: 21\nSkinModelPath: test.SMD\nOrgColor: ffffffff\nSrcBlend: 5\nDestBlend: 6\nOuterNum: 0\nBoneNum: 0\nCoGfxNum: 0\nComActCount: 0\nAddiSkinCount: 0\n";
        let ecm = EcmModel::parse(data).unwrap();
        assert_eq!(ecm.version, 21);
        assert_eq!(ecm.skin_model_path, "test.SMD");
        assert!(ecm.additional_skins.is_empty());
    }

    #[test]
    fn parse_with_addi_skin() {
        let data = b"MOXTVersion: 21\r\nSkinModelPath: m.SMD\r\nOrgColor: ffffffff\r\nSrcBlend: 5\r\nDestBlend: 6\r\nOuterNum: 0\r\nBoneNum: 0\r\nCoGfxNum: 0\r\nComActCount: 0\r\nAddiSkinCount: 1\r\nAddiSkinPath: m.SKI\r\n";
        let ecm = EcmModel::parse(data).unwrap();
        assert_eq!(ecm.additional_skins, vec!["m.SKI"]);
    }

    #[test]
    fn parse_missing_version() {
        let data = b"SkinModelPath: test.SMD\n";
        assert!(EcmModel::parse(data).is_err());
    }

    #[test]
    fn parse_missing_skin_model_path() {
        let data = b"MOXTVersion: 21\n";
        assert!(EcmModel::parse(data).is_err());
    }

    #[test]
    fn parse_carnivore_plant_ecm() {
        let bytes = include_test_data_bytes!("models/carnivore_plant/carnivore_plant.ecm");
        let ecm = EcmModel::parse(bytes).unwrap();
        assert_eq!(ecm.version, 21);
        assert_eq!(ecm.skin_model_path, "carnivore_plant.SMD");
        assert_eq!(ecm.additional_skins, vec!["carnivore_plant.SKI"]);
        assert_eq!(ecm.bone_scales.len(), 0);
        assert_eq!(ecm.child_models.len(), 0);
        assert_eq!(ecm.org_color, 0xFFFFFFFF);
    }

    #[test]
    fn parse_fallen_general_ecm() {
        let bytes = include_test_data_bytes!("models/fallen_general/fallen_general.ecm");
        let ecm = EcmModel::parse(bytes).unwrap();
        assert_eq!(ecm.version, 21);
        assert_eq!(ecm.skin_model_path, "fallen_general.SMD");
        assert_eq!(ecm.additional_skins, vec!["fallen_general.ski"]);
        assert_eq!(ecm.child_models.len(), 2);
        assert_eq!(ecm.child_models[0].name, "wq_l");
        assert_eq!(ecm.child_models[0].hh_name, "HH_lefthandweapon");
        assert_eq!(ecm.child_models[0].cc_name, "CC_weapon");
        assert_eq!(ecm.child_models[1].name, "wq_r");
        assert_eq!(ecm.child_models[1].hh_name, "HH_righthandweapon");
    }

    #[test]
    fn parse_bone_scale_old_format() {
        let data = b"MOXTVersion: 21\nSkinModelPath: t.SMD\nOrgColor: ffffffff\nSrcBlend: 5\nDestBlend: 6\nOuterNum: 0\nBoneNum: 1\nBoneIndex: 3\nBoneSclType: 2\nBoneScale: 1.200000, 0.800000, 1.000000\nCoGfxNum: 0\nComActCount: 0\nAddiSkinCount: 0\n";
        let ecm = EcmModel::parse(data).unwrap();
        assert_eq!(ecm.bone_scales.len(), 1);
        assert_eq!(ecm.bone_scales[0].bone_index, 3);
        assert_eq!(ecm.bone_scales[0].scale_type, Some(2));
        assert!((ecm.bone_scales[0].scale[0] - 1.2).abs() < 0.001);
    }

    #[test]
    fn parse_bone_scale_new_format() {
        let data = b"Version: 30\nSkinModelPath: t.SMD\nOrgColor: ffffffff\nSrcBlend: 5\nDestBlend: 6\nOuterNum: 0\nNewScale: 1\nBoneNum: 1\nBoneIndex: 5\nBoneScale: 1.100000, 0.900000, 1.050000\nBip01 R Foot\nDefSpeed: 1.000000\nCoGfxNum: 0\nComActCount: 0\nAddiSkinCount: 0\n";
        let ecm = EcmModel::parse(data).unwrap();
        assert!(ecm.new_bone_scale);
        assert_eq!(ecm.bone_scales.len(), 1);
        assert_eq!(ecm.bone_scales[0].bone_index, 5);
        assert!(ecm.bone_scales[0].scale_type.is_none());
        assert_eq!(ecm.scale_base_bone, Some("Bip01 R Foot".to_string()));
    }
}
