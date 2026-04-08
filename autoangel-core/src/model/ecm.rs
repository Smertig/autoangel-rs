use crate::model::common::decode_gbk;
use eyre::{Result, eyre};

#[derive(Debug, Clone)]
pub struct EcmModel {
    pub version: u32,
    pub skin_model_path: String,
    pub additional_skins: Vec<String>,
}

impl EcmModel {
    pub fn parse(data: &[u8]) -> Result<Self> {
        let text = decode_gbk(data)?;

        let mut version = None;
        let mut skin_model_path = None;
        let mut addi_skin_count = 0u32;
        let mut additional_skins = Vec::new();
        let mut reading_addi_skins = false;

        for line in text.lines() {
            let line = line.trim();

            if let Some(v) = line
                .strip_prefix("MOXTVersion: ")
                .or_else(|| line.strip_prefix("Version: "))
            {
                version = Some(
                    v.trim()
                        .parse::<u32>()
                        .map_err(|_| eyre!("Invalid ECM version: {v}"))?,
                );
            } else if let Some(v) = line.strip_prefix("SkinModelPath: ") {
                skin_model_path = Some(v.trim().to_string());
            } else if let Some(v) = line.strip_prefix("AddiSkinCount: ") {
                addi_skin_count = v
                    .trim()
                    .parse::<u32>()
                    .map_err(|_| eyre!("Invalid AddiSkinCount: {v}"))?;
                reading_addi_skins = true;
            } else if reading_addi_skins && let Some(v) = line.strip_prefix("AddiSkinPath: ") {
                additional_skins.push(v.trim().to_string());
                if additional_skins.len() as u32 >= addi_skin_count {
                    reading_addi_skins = false;
                }
            }
        }

        Ok(EcmModel {
            version: version.ok_or_else(|| eyre!("Missing version in ECM"))?,
            skin_model_path: skin_model_path
                .ok_or_else(|| eyre!("Missing SkinModelPath in ECM"))?,
            additional_skins,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::include_test_data_bytes;

    #[test]
    fn parse_moxt_version() {
        let data = b"MOXTVersion: 21\r\nSkinModelPath: test.SMD\r\n";
        let ecm = EcmModel::parse(data).unwrap();
        assert_eq!(ecm.version, 21);
        assert_eq!(ecm.skin_model_path, "test.SMD");
        assert!(ecm.additional_skins.is_empty());
    }

    #[test]
    fn parse_standard_version() {
        let data = b"Version: 55\nSkinModelPath: models\\test.smd\n";
        let ecm = EcmModel::parse(data).unwrap();
        assert_eq!(ecm.version, 55);
    }

    #[test]
    fn parse_with_addi_skin() {
        let data =
            b"MOXTVersion: 21\r\nSkinModelPath: m.SMD\r\nAddiSkinCount: 1\r\nAddiSkinPath: m.SKI\r\n";
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
    }

    #[test]
    fn parse_fallen_general_ecm() {
        let bytes = include_test_data_bytes!("models/fallen_general/fallen_general.ecm");
        let ecm = EcmModel::parse(bytes).unwrap();
        assert_eq!(ecm.version, 21);
        assert_eq!(ecm.skin_model_path, "fallen_general.SMD");
        assert_eq!(ecm.additional_skins, vec!["fallen_general.ski"]);
    }
}
