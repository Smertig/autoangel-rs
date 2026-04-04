mod pw;

use crate::elements::util::DataType;
use std::fmt::Formatter;

pub trait GameDialect {
    fn short_name(&self) -> &'static str;
    fn full_name(&self) -> &'static str;
    fn dt_to_space(&self, dt: DataType) -> Option<&'static str>;
}

#[derive(Clone, Copy)]
pub struct GameDialectRef(&'static (dyn GameDialect + Sync + Send));

//noinspection RsConstReferStatic (bug in RR)
impl GameDialectRef {
    /// Perfect World game dialect
    pub const PW: Self = {
        static PW_DIALECT: pw::PWGameDialect = pw::PWGameDialect;
        GameDialectRef(&PW_DIALECT)
    };

    pub fn get(name: &str) -> Option<Self> {
        match name {
            "pw" => Some(Self::PW),
            _ => None,
        }
    }
}

impl std::ops::Deref for GameDialectRef {
    type Target = dyn GameDialect;

    fn deref(&self) -> &Self::Target {
        self.0
    }
}

impl std::fmt::Debug for GameDialectRef {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.short_name())
    }
}
