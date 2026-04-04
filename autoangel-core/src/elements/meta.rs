use super::value::ReadValue;
use crate::util::DropLeadingZeros;
use crate::util::data_source::DataSource;
use encoding::Encoding;
use eyre::{Result, WrapErr, bail, eyre};
use std::borrow::Cow;
use std::convert::TryFrom;

#[derive(Eq, PartialEq)]
pub enum MetaType {
    I32(FundamentalMetaType<i32>),
    I64(FundamentalMetaType<i64>),
    F32(FundamentalMetaType<f32>),
    F64(FundamentalMetaType<f64>),
    ByteAuto(ByteAutoMetaType),
    Bytes(ByteMetaType),
    GBKString(StringMetaType<u8>),
    UTF16String(StringMetaType<u16>),
}

impl std::fmt::Debug for MetaType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.repr())
    }
}

impl MetaType {
    pub fn get_byte_size(&self, data: &DataSource) -> Result<usize> {
        match self.fixed_byte_size() {
            Some(size) => Ok(size),
            None => match self {
                MetaType::ByteAuto(meta) => Ok(meta.get_byte_size(data)?),
                _ => unreachable!(),
            },
        }
    }

    /// Returns the fixed byte size if this type has a constant size,
    /// or `None` for variable-size types (ByteAuto).
    pub fn fixed_byte_size(&self) -> Option<usize> {
        match self {
            MetaType::I32(meta) => Some(meta.get_byte_size()),
            MetaType::I64(meta) => Some(meta.get_byte_size()),
            MetaType::F32(meta) => Some(meta.get_byte_size()),
            MetaType::F64(meta) => Some(meta.get_byte_size()),
            MetaType::ByteAuto(_) => None,
            MetaType::Bytes(meta) => Some(meta.get_byte_size()),
            MetaType::GBKString(meta) => Some(meta.get_byte_size()),
            MetaType::UTF16String(meta) => Some(meta.get_byte_size()),
        }
    }

    pub fn read_value(&self, bytes: &[u8]) -> Result<ReadValue> {
        Ok(match self {
            MetaType::I32(meta) => ReadValue::Integer(meta.value_from_bytes(bytes) as i64),
            MetaType::I64(meta) => ReadValue::Integer(meta.value_from_bytes(bytes)),
            MetaType::F32(meta) => ReadValue::Float(meta.value_from_bytes(bytes)),
            MetaType::F64(meta) => ReadValue::Double(meta.value_from_bytes(bytes)),
            MetaType::ByteAuto(meta) => ReadValue::Bytes(meta.value_from_bytes(bytes)),
            MetaType::Bytes(meta) => ReadValue::Bytes(meta.value_from_bytes(bytes)),
            MetaType::GBKString(meta) => ReadValue::String(meta.value_from_bytes(bytes)?),
            MetaType::UTF16String(meta) => ReadValue::String(meta.value_from_bytes(bytes)?),
        })
    }

    pub fn repr(&self) -> Cow<'_, str> {
        match self {
            MetaType::I32(meta) => meta.repr(),
            MetaType::I64(meta) => meta.repr(),
            MetaType::F32(meta) => meta.repr(),
            MetaType::F64(meta) => meta.repr(),
            MetaType::ByteAuto(meta) => meta.repr(),
            MetaType::Bytes(meta) => meta.repr(),
            MetaType::GBKString(meta) => meta.repr(),
            MetaType::UTF16String(meta) => meta.repr(),
        }
    }
}

#[derive(Eq, PartialEq, Debug)]
pub struct MetaField {
    pub name: String,
    pub meta_type: MetaType,
}

/// Parse meta-type from string
pub fn parse_type(type_name: &str) -> Result<MetaType> {
    match type_name {
        "int32" => Ok(MetaType::I32(FundamentalMetaType::<i32>::default())),
        "int64" => Ok(MetaType::I64(FundamentalMetaType::<i64>::default())),
        "float" => Ok(MetaType::F32(FundamentalMetaType::<f32>::default())),
        "double" => Ok(MetaType::F64(FundamentalMetaType::<f64>::default())),
        "byte:AUTO" => Ok(MetaType::ByteAuto(ByteAutoMetaType::default())),
        other => {
            if let Some(colon_pos) = other.find(':') {
                let (left, right) = other.split_at(colon_pos);
                let length = right[1..].parse()?;

                return Ok(match left {
                    "string" => MetaType::GBKString(StringMetaType::<u8>::new(length)),
                    "wstring" => MetaType::UTF16String(StringMetaType::<u16>::new(length)),
                    "byte" => MetaType::Bytes(ByteMetaType::new(length)),
                    _ => bail!("Unexpected type '{left}' left to ':'"),
                });
            }

            bail!("Unknown meta-type '{type_name}'")
        }
    }
}

/// Meta-type for fundamental types (like i32, i64, f32 and so on)
#[derive(Default, Debug)]
pub struct FundamentalMetaType<T> {
    _marker: std::marker::PhantomData<T>,
}

impl<T> PartialEq for FundamentalMetaType<T> {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}

impl<T> Eq for FundamentalMetaType<T> {}

impl<T: endiannezz::Primitive> FundamentalMetaType<T>
where
    <T as endiannezz::Primitive>::Buf: Into<Box<[u8]>> + for<'a> TryFrom<&'a [u8]>,
{
    pub fn get_byte_size(&self) -> usize {
        std::mem::size_of::<T>()
    }

    pub fn value_from_bytes(&self, bytes: &[u8]) -> T {
        let buf = bytes
            .try_into()
            .map_err(|_| ())
            .expect("wrong byte size for LE parse");
        T::from_le_bytes(buf)
    }

    pub fn value_to_bytes(&self, value: T) -> Box<[u8]> {
        value.to_le_bytes().into()
    }

    fn repr(&self) -> Cow<'_, str> {
        std::any::type_name::<T>().into()
    }
}

/// Meta-type for string meta-types
#[derive(Debug, Eq, PartialEq)]
pub struct StringMetaType<T> {
    length: usize,
    _marker: std::marker::PhantomData<T>,
}

/// Meta-type for raw bytes
#[derive(Default, Debug, Eq, PartialEq)]
pub struct ByteAutoMetaType {}

/// Meta-type for raw sized bytes meta-type
#[derive(Debug, Eq, PartialEq)]
pub struct ByteMetaType {
    length: usize,
}

impl<T> StringMetaType<T> {
    fn new(byte_length: usize) -> Self {
        // TODO: return error?
        debug_assert!(
            byte_length.is_multiple_of(std::mem::size_of::<T>()),
            "invalid byte_length {} for {}",
            byte_length,
            std::any::type_name::<Self>()
        );

        Self {
            length: byte_length / std::mem::size_of::<T>(),
            _marker: Default::default(),
        }
    }

    pub fn get_byte_size(&self) -> usize {
        std::mem::size_of::<T>() * self.length
    }

    fn extend_to_buffer_size(
        &self,
        mut bytes: Vec<u8>,
        string: &str,
        encoding: &'static str,
    ) -> Result<Box<[u8]>> {
        // at least sizeof(T) zero bytes should be placed at the end
        if bytes.len() > self.get_byte_size() - std::mem::size_of::<T>() {
            return Err(eyre!(
                "Error converting string '{string}' to {encoding}: result len ({}) > storage size ({})",
                bytes.len(),
                self.get_byte_size()
            ));
        }

        bytes.extend(std::iter::repeat_n(0, self.get_byte_size() - bytes.len()));

        Ok(bytes.into_boxed_slice())
    }
}

impl StringMetaType<u16> {
    pub fn value_from_bytes(&self, bytes: &[u8]) -> Result<String> {
        let u16_bytes: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|a| u16::from_le_bytes([a[0], a[1]]))
            .collect();
        let u16_bytes = u16_bytes.as_slice().drop_leading_zeros();

        String::from_utf16(u16_bytes)
            .wrap_err_with(|| eyre!("Error parsing UTF16 string from '{bytes:02X?}'"))
    }

    pub fn value_to_bytes(&self, value: String) -> Result<Box<[u8]>> {
        let bytes: Vec<u8> = value.encode_utf16().flat_map(u16::to_le_bytes).collect();

        self.extend_to_buffer_size(bytes, &value, "UTF16")
    }

    fn repr(&self) -> Cow<'_, str> {
        format!("utf16_string:{}", self.length).into()
    }
}

impl StringMetaType<u8> {
    pub fn value_from_bytes(&self, bytes: &[u8]) -> Result<String> {
        assert!(bytes.ends_with(&[0]));

        encoding::all::GBK
            .decode(
                bytes.drop_leading_zeros(),
                encoding::DecoderTrap::Call(|_, _, output| {
                    // there can be invalid strings in elements.data (incomplete sequence at the end of string)
                    output.write_char('?');
                    true
                }),
            )
            .map_err(|msg| eyre!(msg))
            .wrap_err_with(|| eyre!("Error parsing GBK string from '{bytes:02X?}'"))
    }

    pub fn value_to_bytes(&self, value: String) -> Result<Box<[u8]>> {
        let bytes = encoding::all::GBK
            .encode(&value, encoding::EncoderTrap::Strict)
            .map_err(|msg| eyre!(msg))
            .wrap_err_with(|| eyre!("error converting string '{value}' to GBK"))?;

        self.extend_to_buffer_size(bytes, &value, "GBK")
    }

    fn repr(&self) -> Cow<'_, str> {
        format!("gbk_string:{}", self.length).into()
    }
}

impl ByteMetaType {
    fn new(length: usize) -> Self {
        Self { length }
    }
}

impl ByteAutoMetaType {
    fn get_byte_size(&self, data: &DataSource) -> Result<usize> {
        let mut pos = 0x84;

        let num_window: u32 = data.get(pos..pos + 4)?.as_le()?;
        pos += 4;

        for _ in 0..num_window {
            pos += 4;
            pos += 4;

            let talk_text_len: u32 = data.get(pos..pos + 4)?.as_le()?;
            pos += 4;
            pos += talk_text_len as usize * 2;

            let num_option: u32 = data.get(pos..pos + 4)?.as_le()?;
            pos += 4;
            pos += num_option as usize * 0x88;
        }

        Ok(pos)
    }

    pub fn value_from_bytes(&self, bytes: &[u8]) -> Vec<u8> {
        bytes.to_vec()
    }

    pub fn repr(&self) -> Cow<'_, str> {
        "raw_bytes".into()
    }
}

impl ByteMetaType {
    pub fn get_byte_size(&self) -> usize {
        self.length
    }

    pub fn value_from_bytes(&self, bytes: &[u8]) -> Vec<u8> {
        bytes.to_vec()
    }

    pub fn repr(&self) -> Cow<'_, str> {
        format!("byte:{}", self.length).into()
    }
}
