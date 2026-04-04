use super::{meta::*, util};
use crate::elements::game::GameDialectRef;
use crate::util::data_source::DataSource;
use crate::util::line_reader::{LineReader, make_line_reader};
use eyre::{Result, WrapErr, bail, eyre};
use itertools::Itertools;
use once_cell::sync::Lazy;
use std::sync::Arc;

#[derive(Eq, PartialEq, Debug, Clone)]
pub enum ListOffset {
    Auto,
    Fixed(usize),
}

#[derive(Eq, PartialEq, Debug, Clone)]
pub struct ListConfig {
    pub offset: ListOffset,
    pub caption: Arc<str>,
    pub dt: util::DataType,
    pub space_id: Option<&'static str>,
    pub fields: Arc<[MetaField]>,
}

impl ListConfig {
    fn parse<'a, I: Iterator<Item = (usize, &'a str)>>(
        reader: &mut LineReader<'a, I>,
        game: GameDialectRef,
    ) -> Result<Self> {
        let line = reader.next().wrap_err("Missing list caption")?;
        let (list_id, caption) = line
            .splitn(2, " - ")
            .collect_tuple()
            .ok_or_else(|| eyre!("Wrong element list caption: '{line}'"))?;

        let list_id = list_id
            .parse()
            .wrap_err_with(|| eyre!("Wrong element list ID: '{list_id}'"))?;

        let offset = match reader.next().wrap_err("Missing list offset")? {
            "AUTO" => ListOffset::Auto,
            number => ListOffset::Fixed(
                number
                    .parse()
                    .wrap_err_with(|| eyre!("Wrong element list offset: '{number}'"))?,
            ),
        };

        let field_names = reader
            .next()
            .wrap_err("Missing field names")?
            .split(';')
            .collect::<Vec<_>>();

        let field_types = reader
            .next()
            .wrap_err("Missing field types")?
            .split(';')
            .collect::<Vec<_>>();

        if field_names.len() != field_types.len() {
            bail!(
                "Element list '{caption}' has {} names and {} types",
                field_names.len(),
                field_types.len()
            );
        }

        Ok(ListConfig {
            caption: caption.into(),
            dt: util::DataType(list_id),
            space_id: game.dt_to_space(util::DataType(list_id)),
            fields: field_names
                .into_iter()
                .zip(field_types.into_iter())
                .enumerate()
                .map(|(i, (name, type_))| {
                    Self::parse_meta_field(name, type_).wrap_err_with(|| {
                        eyre!("Can't parse #{i} meta-field '{name}' with type '{type_}'")
                    })
                })
                .collect::<Result<Vec<_>>>()?
                .into(),
            offset,
        })
    }

    pub fn find_field(&self, name: &str) -> Option<usize> {
        self.fields
            .iter()
            .find_position(|field| field.name == name)
            .map(|e| e.0)
    }

    /// Returns the fixed byte size of a single entry if all fields have
    /// constant sizes, or `None` if the list contains variable-size fields.
    pub fn fixed_entry_byte_size(&self) -> Option<usize> {
        self.fields
            .iter()
            .map(|f| f.meta_type.fixed_byte_size())
            .sum()
    }

    /// Computes the byte size of one entry starting at the current position
    /// in `data`, by walking all field sizes. Does not advance `data`.
    pub fn compute_entry_byte_size(&self, data: &DataSource) -> Result<usize> {
        let mut total = 0;
        let mut view = data.clone();
        for field in self.fields.iter() {
            let size = field.meta_type.get_byte_size(&view)?;
            view.remove_prefix(size);
            total += size;
        }
        Ok(total)
    }

    fn parse_meta_field(name: &str, type_: &str) -> Result<MetaField> {
        Ok(MetaField {
            name: name.to_owned(),
            meta_type: parse_type(type_)
                .wrap_err_with(|| eyre!("Can't parse meta-type '{type_}'"))?,
        })
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub name: Option<String>,
    pub game: GameDialectRef,
    pub lists: Arc<[ListConfig]>,
}

impl Config {
    /// Find a bundled config for the specified version
    pub fn find_bundled(version: u16) -> Option<Self> {
        BUNDLED_CONFIGS
            .iter()
            .find(|(v, _)| *v == version)
            .map(|(_, config)| config.clone())
    }

    fn parse_lists<'a, I: Iterator<Item = (usize, &'a str)>>(
        reader: &mut LineReader<'a, I>,
        game: GameDialectRef,
    ) -> Result<Arc<[ListConfig]>> {
        let list_count = reader.next()?;
        let list_count = list_count
            .parse()
            .wrap_err_with(|| eyre!("Wrong element list count: {list_count}"))?;

        let _unknown = reader.next()?;

        let lists = (0_usize..list_count)
            .map(|i| {
                ListConfig::parse(reader, game).wrap_err_with(|| eyre!("Can't parse #{i} list"))
            })
            .collect::<Result<Vec<_>>>()?
            .into();

        if let Ok(extra_line) = reader.next() {
            bail!("Expected EOF, found '{extra_line}'")
        }

        Ok(lists)
    }

    pub fn parse(content: &str, name: Option<String>, game: GameDialectRef) -> Result<Self> {
        Ok(Config {
            name,
            game,
            lists: Self::parse_lists(&mut make_line_reader(content), game)?,
        })
    }
}

pub static BUNDLED_CONFIGS: Lazy<Vec<(u16, Config)>> = Lazy::new(|| {
    use include_dir::*;

    const CONFIGS_DIR: Dir = include_dir!("$CARGO_MANIFEST_DIR/resources/known_configs");

    let game = GameDialectRef::PW;

    CONFIGS_DIR
        .files()
        .map(|file| {
            let file_name = file
                .path()
                .file_name()
                .expect("missing file name for bundled config")
                .to_str()
                .expect("incorrect file name of bundled config: non-utf8");

            let pos = 2 + file_name
                .find("_v")
                .expect("incorrect file name of bundled config: missing '_v'");

            let end_pos = file_name[pos..]
                .find(|c: char| !c.is_ascii_digit())
                .expect("incorrect file name of bundled config");

            let version = file_name[pos..pos + end_pos].parse::<u16>().unwrap();
            let config = Config::parse(
                file.contents_utf8().unwrap(),
                Some(file_name.to_owned()),
                game,
            )
            .expect("can't parse bundled config");

            (version, config)
        })
        .collect()
});

#[cfg(test)]
mod tests {
    use super::{super::meta::MetaType, *};
    use crate::include_resources_str;

    #[test]
    fn test_bundled() {
        for _ in BUNDLED_CONFIGS.iter() {
            // nothing
        }
    }

    #[test]
    #[rustfmt::skip]
    fn test_parse_type() {
        assert_eq!(parse_type("int32").unwrap(), MetaType::I32(Default::default()));
        assert_eq!(parse_type("int64").unwrap(), MetaType::I64(Default::default()));
        assert_eq!(parse_type("float").unwrap(), MetaType::F32(Default::default()));
    }

    #[test]
    fn meta_i32() {
        let meta = FundamentalMetaType::<i32>::default();

        assert_eq!(meta.get_byte_size(), 4);

        assert_eq!(meta.value_from_bytes(b"\x01\x02\x03\x04"), 0x04030201_i32);
        assert_eq!(meta.value_from_bytes(b"\x00\x00\x00\x00"), 0_i32);
    }

    #[test]
    fn parse_list_config() {
        let game = GameDialectRef::PW;

        let parse_list = |content| ListConfig::parse(&mut make_line_reader(content), game);

        assert!(parse_list("").is_err());

        // Err: missing offset
        assert!(parse_list("123 - hello").is_err());

        // Err: offset is not a number
        assert!(parse_list("123 - hello\nasd").is_err());

        // Err: missing names
        assert!(parse_list("123 - hello\n123").is_err());

        // Err: unknown types
        assert!(parse_list("123 - hello\n123\r\nID;Name;unk1;unk2\na;b;c;d").is_err());

        // Err: missing types
        assert!(parse_list("123 - hello\n123\r\nID;Name;unk1;unk2").is_err());

        // Err: 4 names, 3 types
        assert!(parse_list("123 - hello\n123\r\nID;Name;unk1;unk2\nint32;int32;int32").is_err());

        // Err: extra ; at the end
        assert!(
            parse_list("123 - hello\n123\r\nID;Name;unk1;unk2\nint32;int32;int32;int32;").is_err()
        );

        // Err: 4 names, 5 types
        assert!(
            parse_list("123 - hello\n123\r\nID;Name;unk1;unk2\nint32;int32;int32;int32;int32")
                .is_err()
        );

        assert_eq!(
            parse_list("123 - hello\n123\nID;Name;unk_1;unk2\nint32;int32;int32;int32\n").unwrap(),
            ListConfig {
                offset: ListOffset::Fixed(123),
                caption: "hello".into(),
                dt: util::DataType(123),
                space_id: Some("essence"),
                fields: vec![
                    MetaField {
                        name: "ID".to_owned(),
                        meta_type: MetaType::I32(FundamentalMetaType::<i32>::default())
                    },
                    MetaField {
                        name: "Name".to_owned(),
                        meta_type: MetaType::I32(FundamentalMetaType::<i32>::default())
                    },
                    MetaField {
                        name: "unk_1".to_owned(),
                        meta_type: MetaType::I32(FundamentalMetaType::<i32>::default())
                    },
                    MetaField {
                        name: "unk2".to_owned(),
                        meta_type: MetaType::I32(FundamentalMetaType::<i32>::default())
                    }
                ]
                .into()
            }
        );
    }

    #[test]
    fn parse_config() {
        let game = GameDialectRef::PW;

        let try_parse = |content: &str| match Config::parse(content, None, game) {
            Ok(_config) => { /*println!("config: {:?}", config)*/ }
            Err(err) => panic!("error: {err:?}"),
        };

        try_parse(include_resources_str!("known_configs/PW_1.1.6_v6.cfg"));
        try_parse(include_resources_str!("known_configs/PW_1.4.6_v80.cfg"));
        try_parse(include_resources_str!("known_configs/PW_1.5.1_v101.cfg"));
        try_parse(include_resources_str!("known_configs/PW_1.5.3_v145.cfg"));
        try_parse(include_resources_str!("known_configs/PW_1.5.5_v156.cfg"));
    }

    #[test]
    fn parse_bad_config() {
        let game = GameDialectRef::PW;

        // Parse config
        let config = Config::parse(
            r#"
2
bla-bla

001 - EQUIPMENT_ADDON
0
ID;Name;num_params;param1;param2;param3
int32;wstring:64;int32;int32;int32;int32

002 - WEAPON_MAJOR_TYPE
0
ID;Name
int32;wstring:64

003 - WEAPON_SUB_TYPE
0
ID;Name;file_hitgfx;file_hitsfx;probability_fastest;probability_fast;probability_normal;probability_slow;probability_slowest;attack_speed;attack_short_range;action_type
int32;wstring:64;string:128;string:128;float;float;float;float;float;float;float;int32

"#,
            None,
            game,
        );

        assert_eq!(
            config.unwrap_err().to_string(),
            "Expected EOF, found '003 - WEAPON_SUB_TYPE'"
        );
    }
}
