use std::fmt::Formatter;

#[derive(PartialEq, Debug)]
pub enum ReadValue {
    Integer(i64),
    Float(f32),
    Double(f64),
    String(String),
    Bytes(Vec<u8>),
}

impl std::fmt::Display for ReadValue {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            ReadValue::Integer(value) => write!(f, "{value}"),
            ReadValue::Float(value) => write!(f, "{value}"),
            ReadValue::Double(value) => write!(f, "{value}"),
            ReadValue::String(value) => write!(f, "{value:?}"),
            ReadValue::Bytes(value) => write!(f, "{value:02X?}"),
        }
    }
}
