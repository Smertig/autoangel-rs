use crate::model::bindable;
use crate::model::common::decode_gbk;
use crate::model::text_reader::Lines;
use eyre::{Result, eyre};
use macro_rules_attribute::apply;

#[apply(bindable)]
#[derive(Default)]
pub struct BoneScaleEntry {
    pub bone_index: i32,
    /// Old format: (scale_x, scale_y, scale_z). New (BoneScaleEx): (len, thick, whole).
    pub scale: [f32; 3],
    /// `Some(type)` for old format, `None` for BoneScaleEx.
    pub scale_type: Option<i32>,
}

#[apply(bindable)]
#[derive(Default)]
pub struct ChildModel {
    pub name: String,
    pub path: String,
    pub hh_name: String,
    pub cc_name: String,
}

/// A visual/sound event triggered during animation or as persistent CoGfx.
#[apply(bindable)]
#[derive(Default)]
pub struct EcmEvent {
    pub event_type: i32, // 100=GFX, 101=Sound, 102+=other
    pub start_time: i32,
    pub time_span: i32, // -1 = infinite
    pub once: bool,
    pub fx_file_path: String,
    pub hook_name: String,
    pub hook_offset: [f32; 3],
    pub hook_yaw: f32,
    pub hook_pitch: f32,
    pub hook_rot: f32,
    pub bind_parent: bool,
    pub fade_out: i32,
    pub use_model_alpha: bool,
    // EventType 100 (GFX) only:
    pub gfx_scale: Option<f32>,
    pub gfx_speed: Option<f32>,
    // EventType 101 (Sound) only:
    pub volume: Option<i32>,
    pub min_dist: Option<f32>,
    pub max_dist: Option<f32>,
    pub force_2d: Option<bool>,
    pub is_loop: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct BaseAction {
    pub name: String,
    pub start_time: i32,
    pub loop_count: i32,
}

#[derive(Debug, Clone)]
pub struct CombineAction {
    pub name: String,
    pub loop_count: i32,
    pub base_actions: Vec<BaseAction>,
    pub events: Vec<EcmEvent>,
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
    pub co_gfx: Vec<EcmEvent>,
    pub combine_actions: Vec<CombineAction>,
}

/// Parse a single event block (EventType 100–104). The format varies by ECM
/// version and event type. For event types we don't fully understand (102–104+),
/// we skip lines until the next known boundary key.
fn parse_event(r: &mut Lines, version: u32) -> Result<EcmEvent> {
    let event_type = r.read::<i32>("EventType")?;

    // Event base: StartTime/FxStartTime, TimeSpan, Once
    // v<18: only FxStartTime, no TimeSpan, no Once
    // v18-19: StartTime + Once, no TimeSpan
    // v>=20: StartTime + TimeSpan + Once
    let start_time = if version >= 18 {
        r.read::<i32>("StartTime")?
    } else {
        r.read::<i32>("FxStartTime")?
    };
    let time_span = if version >= 20 {
        r.read::<i32>("TimeSpan")?
    } else {
        -1
    };
    let once = if version >= 18 {
        r.read::<i32>("Once")? != 0
    } else {
        false
    };

    // Event types 102+ (ChildAct, Color, Attack, etc.) have completely different
    // field layouts. Skip until the next event/action/section boundary.
    if event_type != 100 && event_type != 101 {
        while !r.done() {
            let key = r.peek_key();
            if matches!(
                key,
                Some("EventType")
                    | Some("EventCount")
                    | Some("CombineActName")
                    | Some("AddiSkinCount")
                    | Some("ScriptCount")
                    | Some("ChildCount")
            ) {
                break;
            }
            r.next_line()?;
        }
        return Ok(EcmEvent {
            event_type,
            start_time,
            time_span,
            once,
            ..Default::default()
        });
    }

    // FX_BASE fields (shared by EventType 100 and 101)
    // v54+: FxFileNum + list, else single FxFilePath
    let fx_file_path = if version >= 54 {
        let num = r.read::<i32>("FxFileNum")? as usize;
        let first = if num > 0 {
            r.read::<String>("FxFilePath")?
        } else {
            String::new()
        };
        // Skip remaining file paths (random selection in engine)
        for _ in 1..num {
            r.next_line()?;
        }
        first
    } else {
        r.read::<String>("FxFilePath")?
    };

    let hook_name = r.read::<String>("HookName")?;
    let hook_offset = r.read::<[f32; 3]>("HookOffset")?;
    let hook_yaw = r.read::<f32>("HookYaw")?;
    let hook_pitch = r.read::<f32>("HookPitch")?;
    let hook_rot = if version >= 19 {
        r.read::<f32>("HookRot")?
    } else {
        0.0
    };
    let bind_parent = r.read::<i32>("BindParent")? != 0;
    let fade_out = if version >= 15 {
        r.read::<i32>("FadeOut")?
    } else {
        0 // v<=14: FadeOut appears in GFX_INFO section instead
    };
    let use_model_alpha = if version >= 18 {
        r.read::<i32>("UseModelAlpha")? != 0
    } else {
        false
    };
    // v59+: CustomPath, v62+: CustomData — skip
    if version >= 59 {
        r.next_line()?; // CustomPath
    }
    if version >= 62 {
        r.next_line()?; // CustomData
    }

    let mut gfx_scale = None;
    let mut gfx_speed = None;
    let mut volume = None;
    let mut min_dist = None;
    let mut max_dist = None;
    let mut force_2d = None;
    let mut is_loop = None;

    if event_type == 100 {
        // GFX_INFO fields
        gfx_scale = Some(r.read::<f32>("GfxScale")?);
        if version >= 22 {
            r.read::<f32>("GfxAlpha")?; // skip, not stored
        }
        gfx_speed = Some(r.read::<f32>("GfxSpeed")?);
        // v<=14: FadeOut appears here (in GFX_INFO section) instead of in FX_BASE
        if version <= 14 {
            r.read::<i32>("FadeOut")?; // already stored as 0 above; just consume
        }
        if version >= 23 {
            r.next_line()?; // GfxOuterPath
        }
        if version >= 35 {
            r.next_line()?; // GfxRelToECM
        }
        if version >= 54 {
            r.next_line()?; // GfxDelayTime
        }
        if version >= 66 {
            r.next_line()?; // GfxRotWithModel
        }
        if version >= 71 {
            r.next_line()?; // GfxUseFixedPoint
        }
        let gfx_param_count = r.read::<i32>("GfxParamCount")? as usize;
        for _ in 0..gfx_param_count {
            // Each param: ParamEleName, ParamId, ParamDataType, ParamDataIsCmd, ParamDataHook
            r.next_line()?; // ParamEleName
            r.next_line()?; // ParamId
            r.next_line()?; // ParamDataType
            r.next_line()?; // ParamDataIsCmd
            r.next_line()?; // ParamDataHook
        }
    } else if event_type == 101 {
        // SFX_INFO fields
        r.read::<i32>("SoundVer")?;
        force_2d = Some(r.read::<i32>("Force2D")? != 0);
        is_loop = Some(r.read::<i32>("IsLoop")? != 0);
        if version >= 54 {
            r.next_line()?; // VolMin
            r.next_line()?; // VolMax
            if version >= 65 {
                r.next_line()?; // AbsoluteVolume
            }
            r.next_line()?; // PitchMin
            r.next_line()?; // PitchMax
        } else {
            volume = Some(r.read::<i32>("Volume")?);
        }
        min_dist = Some(r.read::<f32>("MinDist")?);
        max_dist = Some(r.read::<f32>("MaxDist")?);
        if version >= 65 {
            r.next_line()?; // FixSpeed
            r.next_line()?; // SilentHeader
        }
        if version >= 71 {
            r.next_line()?; // PercentStart
            r.next_line()?; // Group
        }
    }

    Ok(EcmEvent {
        event_type,
        start_time,
        time_span,
        once,
        fx_file_path,
        hook_name,
        hook_offset,
        hook_yaw,
        hook_pitch,
        hook_rot,
        bind_parent,
        fade_out,
        use_model_alpha,
        gfx_scale,
        gfx_speed,
        volume,
        min_dist,
        max_dist,
        force_2d,
        is_loop,
    })
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
        let skin_model_path = r.read::<String>("SkinModelPath")?;

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
        let mut co_gfx = Vec::new();
        let mut combine_actions = Vec::new();

        if version >= 33 && r.peek_key() == Some("AutoUpdata") {
            r.read::<i32>("AutoUpdata")?;
        }

        if version >= 16 {
            org_color = r.read_hex_u32("OrgColor")?;

            if version >= 52 {
                r.read_hex_u32("EmissiveCol")?;
            }
            if version >= 21 {
                src_blend = r.read::<i32>("SrcBlend")?;
                dest_blend = r.read::<i32>("DestBlend")?;
            }

            let outer_num = r.read::<i32>("OuterNum")? as usize;
            for _ in 0..outer_num {
                outer_floats.push(r.read::<f32>("Float")?);
            }

            if version >= 28 {
                new_bone_scale = r.read::<i32>("NewScale")? != 0;
            }

            let bone_num = r.read::<i32>("BoneNum")? as usize;
            for _ in 0..bone_num {
                let bone_index = r.read::<i32>("BoneIndex")?;
                if new_bone_scale {
                    let scale = r.read::<[f32; 3]>("BoneScale")?;
                    bone_scales.push(BoneScaleEntry {
                        bone_index,
                        scale,
                        scale_type: None,
                    });
                } else {
                    let scale_type = r.read::<i32>("BoneSclType")?;
                    let scale = r.read::<[f32; 3]>("BoneScale")?;
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
            def_play_speed = r.read::<f32>("DefSpeed")?;
        }
        if version >= 43 {
            r.read::<i32>("CanCastShadow")?;
        }
        if version >= 45 {
            r.read::<i32>("RenderModel")?;
        }
        if version >= 48 {
            r.read::<i32>("RenderEdge")?;
        }

        // Scan forward to CoGfxNum/ComActCount/AddiSkinCount, skipping any
        // version-specific fields (pixel shader, channel mask, etc. in v>=57).
        while !r.done() {
            let key = r.peek_key();
            if matches!(
                key,
                Some("CoGfxNum") | Some("ComActCount") | Some("AddiSkinCount")
            ) {
                break;
            }
            r.next_line()?;
        }

        // Read counts: CoGfxNum then ComActCount (both before the actual data)
        let co_gfx_count = if !r.done() && r.peek_key() == Some("CoGfxNum") {
            r.read::<i32>("CoGfxNum")? as usize
        } else {
            0
        };
        let com_act_count = if !r.done() && r.peek_key() == Some("ComActCount") {
            r.read::<i32>("ComActCount")? as usize
        } else {
            0
        };

        // v68+: AudioEventGroupEnable × 11
        if version >= 68 {
            for _ in 0..11 {
                r.next_line()?;
            }
        }
        // v70+: ParticleBonesCount + bone indices
        if version >= 70 {
            let particle_bones_count = r.read::<i32>("ParticleBonesCount")? as usize;
            for _ in 0..particle_bones_count {
                r.next_line()?;
            }
        }

        // CoGfx persistent events (loaded AFTER ComActCount + AudioGroup + ParticleBones)
        for _ in 0..co_gfx_count {
            co_gfx.push(parse_event(&mut r, version)?);
        }

        // Combined actions
        {
            for _ in 0..com_act_count {
                let name = r.read::<String>("CombineActName")?;
                let loop_count = if version >= 3 {
                    r.read::<i32>("LoopCount")?
                } else {
                    0
                };

                // v30+: RankCount + per-rank "Channel: %d, Rank: %d" lines
                if version >= 30 {
                    let rank_count = r.read::<i32>("RankCount")? as usize;
                    for _ in 0..rank_count {
                        r.next_line()?; // "Channel: %d, Rank: %d"
                    }
                }
                // v32+: EventChannel
                if version >= 32 {
                    r.read::<i32>("EventChannel")?;
                }
                // v40+: PlaySpeed
                if version >= 40 {
                    r.read::<f32>("PlaySpeed")?;
                }
                // v49+: StopChildAct, ResetMtl
                if version >= 49 {
                    r.read::<i32>("StopChildAct")?;
                    r.read::<i32>("ResetMtl")?;
                }

                let base_act_count = r.read::<i32>("BaseActCount")? as usize;
                let mut base_actions = Vec::with_capacity(base_act_count);
                for _ in 0..base_act_count {
                    let base_name = r.read::<String>("BaseActName")?;
                    let act_start_time = r.read::<i32>("ActStartTime")?;
                    // v36+: LoopMinNum + LoopMaxNum instead of LoopCount
                    let base_loop_count = if version >= 36 {
                        let min_loops = r.read::<i32>("LoopMinNum")?;
                        r.read::<i32>("LoopMaxNum")?; // skip max, use min
                        min_loops
                    } else {
                        r.read::<i32>("LoopCount")?
                    };
                    base_actions.push(BaseAction {
                        name: base_name,
                        start_time: act_start_time,
                        loop_count: base_loop_count,
                    });
                }
                let event_count = r.read::<i32>("EventCount")? as usize;
                let mut events = Vec::with_capacity(event_count);
                for _ in 0..event_count {
                    events.push(parse_event(&mut r, version)?);
                }
                combine_actions.push(CombineAction {
                    name,
                    loop_count,
                    base_actions,
                    events,
                });
            }
        }

        // Additional skins
        if !r.done() && r.peek_key() == Some("AddiSkinCount") {
            let addi_count = r.read::<i32>("AddiSkinCount")? as usize;
            for _ in 0..addi_count {
                additional_skins.push(r.read::<String>("AddiSkinPath")?);
            }
        }

        // Child models
        if !r.done() && r.peek_key() == Some("ChildCount") {
            let child_count = r.read::<i32>("ChildCount")? as usize;
            for _ in 0..child_count {
                child_models.push(ChildModel {
                    name: r.read::<String>("ChildName")?,
                    path: r.read::<String>("ChildPath")?,
                    hh_name: r.read::<String>("HHName")?,
                    cc_name: r.read::<String>("CCName")?,
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
            co_gfx,
            combine_actions,
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
        assert!(ecm.co_gfx.is_empty());
        assert_eq!(ecm.combine_actions.len(), 19);
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

    #[test]
    fn parse_fallen_general_events() {
        let bytes = include_test_data_bytes!("models/fallen_general/fallen_general.ecm");
        let ecm = EcmModel::parse(bytes).unwrap();
        assert_eq!(ecm.combine_actions.len(), 16);
        // First action has 1 GFX event (EventType 100)
        let act0 = &ecm.combine_actions[0];
        assert_eq!(act0.events.len(), 1);
        assert_eq!(act0.events[0].event_type, 100);
        assert!((act0.events[0].gfx_scale.unwrap() - 0.8).abs() < 0.01);
        // Fourth action (index 3) has 1 sound event (EventType 101)
        let act3 = &ecm.combine_actions[3];
        assert_eq!(act3.events.len(), 1);
        assert_eq!(act3.events[0].event_type, 101);
        assert_eq!(act3.events[0].volume, Some(100));
    }
}
