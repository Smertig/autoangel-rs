use crate::util::data_source::{DataReader, DataSource};
use eyre::{Result, eyre};

/// 4-byte MOXB prefix found before standard magic in some game versions.
pub const MOXB_PREFIX: [u8; 4] = [0x4D, 0x4F, 0x58, 0x42];

/// Decode bytes as GBK (which is a superset of ASCII).
pub fn decode_gbk(bytes: &[u8]) -> Result<String> {
    use encoding::Encoding;
    encoding::all::GBK
        .decode(bytes, encoding::DecoderTrap::Strict)
        .map_err(|e| eyre!("Failed to decode GBK string: {e}"))
}

/// Read an i32 count from binary data, rejecting negative values.
pub async fn read_count<R: DataReader>(data: &DataSource<R>, offset: u64) -> Result<usize> {
    let val = data.get(offset..offset + 4)?.as_le::<i32>().await?;
    if val < 0 {
        eyre::bail!("Invalid negative count: {val}");
    }
    Ok(val as usize)
}

/// Check for MOXB prefix and return the offset where standard data begins (0 or 4).
pub async fn detect_moxb_offset<R: DataReader>(data: &DataSource<R>) -> Result<u64> {
    if data.size() < 4 {
        return Ok(0);
    }
    let first4 = data.get(0..4)?;
    let first4 = first4.to_bytes().await?;
    if first4.as_ref() == MOXB_PREFIX {
        Ok(4)
    } else {
        Ok(0)
    }
}

/// Read an Angelica length-prefixed string (AFile::ReadString format).
/// Format: i32 length (LE) + `length` bytes (no null terminator).
/// Returns (string, bytes_consumed).
pub async fn read_astring<R: DataReader>(data: &DataSource<R>) -> Result<(String, u64)> {
    let len = data.get(0..4)?.as_le::<i32>().await?;
    if len < 0 {
        eyre::bail!("Negative string length: {len}");
    }
    let len = len as u64;
    if len == 0 {
        return Ok((String::new(), 4));
    }
    let bytes_ds = data.get(4..4 + len)?;
    let bytes = bytes_ds.to_bytes().await?;
    let s = decode_gbk(&bytes)?;
    Ok((s, 4 + len))
}

/// Read a null-terminated C string. Returns (string, bytes_consumed including null).
pub async fn read_cstring<R: DataReader>(data: &DataSource<R>) -> Result<(String, u64)> {
    let bytes = data.to_bytes().await?;
    let nul_pos = bytes
        .iter()
        .position(|&b| b == 0)
        .ok_or_else(|| eyre!("No null terminator found"))?;
    let s = decode_gbk(&bytes[..nul_pos])?;
    Ok((s, nul_pos as u64 + 1))
}

/// Read a 4x4 matrix (16 LE floats, 64 bytes) from the start of `data`.
pub async fn read_matrix<R: DataReader>(data: &DataSource<R>) -> Result<[f32; 16]> {
    let mut mat = [0f32; 16];
    for i in 0u64..16 {
        mat[i as usize] = data.get(i * 4..(i + 1) * 4)?.as_le::<f32>().await?;
    }
    Ok(mat)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ds(bytes: &[u8]) -> DataSource<Vec<u8>> {
        DataSource::from_bytes(bytes.to_vec())
    }

    #[test]
    fn detect_moxb_present() {
        let mut buf = vec![0x4D, 0x4F, 0x58, 0x42];
        buf.extend_from_slice(&[0; 10]);
        assert_eq!(
            pollster::block_on(detect_moxb_offset(&ds(&buf))).unwrap(),
            4
        );
    }

    #[test]
    fn detect_moxb_absent() {
        let buf = vec![0x41, 0x53, 0x4D, 0x44]; // "ASMD"
        assert_eq!(
            pollster::block_on(detect_moxb_offset(&ds(&buf))).unwrap(),
            0
        );
    }

    #[test]
    fn read_astring_basic() {
        let mut buf = vec![];
        buf.extend_from_slice(&5i32.to_le_bytes());
        buf.extend_from_slice(b"hello");
        let (s, consumed) = pollster::block_on(read_astring(&ds(&buf))).unwrap();
        assert_eq!(s, "hello");
        assert_eq!(consumed, 9);
    }

    #[test]
    fn read_astring_empty() {
        let buf = 0i32.to_le_bytes().to_vec();
        let (s, consumed) = pollster::block_on(read_astring(&ds(&buf))).unwrap();
        assert_eq!(s, "");
        assert_eq!(consumed, 4);
    }

    #[test]
    fn read_astring_negative_length() {
        let buf = (-1i32).to_le_bytes().to_vec();
        assert!(pollster::block_on(read_astring(&ds(&buf))).is_err());
    }

    #[test]
    fn read_cstring_basic() {
        let buf = b"hello\0world";
        let (s, consumed) = pollster::block_on(read_cstring(&ds(buf))).unwrap();
        assert_eq!(s, "hello");
        assert_eq!(consumed, 6);
    }

    #[test]
    fn read_cstring_no_null() {
        let buf = b"hello";
        assert!(pollster::block_on(read_cstring(&ds(buf))).is_err());
    }

    #[test]
    fn read_matrix_identity() {
        let identity = [
            1.0f32, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ];
        let mut buf = vec![];
        for &v in &identity {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        let mat = pollster::block_on(read_matrix(&ds(&buf))).unwrap();
        assert_eq!(mat, identity);
    }
}
