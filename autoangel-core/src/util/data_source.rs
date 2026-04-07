use eyre::{Result, eyre};
use std::convert::TryFrom;
use std::sync::Arc;

/// Low-level trait for reading bytes from a backing store.
///
/// The callback-based `read_at` enables zero-copy access: implementations
/// call `f` directly on their internal buffer (mmap, cache, etc.) without
/// allocating intermediate copies.
pub trait DataReader: Send + Sync {
    #[allow(async_fn_in_trait)] // We use static dispatch (generics), not dyn — no auto trait issue
    async fn read_at<F, T>(&self, offset: u64, len: usize, f: F) -> Result<T>
    where
        F: FnOnce(&[u8]) -> T;

    fn size(&self) -> u64;
}

impl<B: AsRef<[u8]> + Send + Sync> DataReader for B {
    async fn read_at<F, T>(&self, offset: u64, len: usize, f: F) -> Result<T>
    where
        F: FnOnce(&[u8]) -> T,
    {
        let slice = self.as_ref();
        let off = offset as usize;
        let end = off + len;
        if end > slice.len() {
            return Err(eyre!(
                "DataReader: read out of bounds: {}..{} (size {})",
                off,
                end,
                slice.len()
            ));
        }
        Ok(f(&slice[off..end]))
    }

    fn size(&self) -> u64 {
        self.as_ref().len() as u64
    }
}

/// Reads across N consecutive `DataReader`s as if they were one contiguous buffer.
pub struct MultiReader<R: DataReader> {
    parts: Vec<Arc<R>>,
    /// prefix_sums[0] = 0, prefix_sums[i] = sum of sizes of parts[0..i]
    /// Length = parts.len() + 1
    prefix_sums: Vec<u64>,
}

impl<R: DataReader> MultiReader<R> {
    pub fn new(parts: Vec<Arc<R>>) -> Self {
        let mut prefix_sums = Vec::with_capacity(parts.len() + 1);
        prefix_sums.push(0u64);
        for part in &parts {
            prefix_sums.push(prefix_sums.last().unwrap() + part.size());
        }
        Self { parts, prefix_sums }
    }

    fn find_part(&self, offset: u64) -> usize {
        match self.prefix_sums.binary_search(&offset) {
            Ok(i) => {
                if i < self.parts.len() {
                    i
                } else {
                    i - 1
                }
            }
            Err(i) => i - 1,
        }
    }
}

impl<R: DataReader> DataReader for MultiReader<R> {
    async fn read_at<F, T>(&self, offset: u64, len: usize, f: F) -> Result<T>
    where
        F: FnOnce(&[u8]) -> T,
    {
        let end = offset + len as u64;
        let total_size = self.size();
        if end > total_size {
            return Err(eyre!(
                "MultiReader: read out of bounds: {}..{} (size {})",
                offset,
                end,
                total_size,
            ));
        }

        let part_idx = self.find_part(offset);
        let part_end = self.prefix_sums[part_idx + 1];

        // Common case: range fits within a single part — delegate directly
        if end <= part_end {
            let local = offset - self.prefix_sums[part_idx];
            return self.parts[part_idx].read_at(local, len, f).await;
        }

        // Rare case: range spans multiple parts — assemble into a temp buffer
        let mut buf = Vec::with_capacity(len);
        let mut idx = part_idx;
        let mut remaining = len;
        let mut off = offset;
        while remaining > 0 {
            let ps = self.prefix_sums[idx];
            let pe = self.prefix_sums[idx + 1];
            let local = off - ps;
            let available = (pe - ps - local) as usize;
            let to_read = available.min(remaining);

            let piece = self.parts[idx]
                .read_at(local, to_read, |src| src.to_vec())
                .await?;
            buf.extend_from_slice(&piece);

            off += to_read as u64;
            remaining -= to_read;
            idx += 1;
        }
        Ok(f(&buf))
    }

    fn size(&self) -> u64 {
        *self.prefix_sums.last().unwrap_or(&0)
    }
}

/// High-level view into a `DataReader`, supporting sub-views, cursor advancement,
/// and zero-copy processing via callbacks.
#[derive(Clone)]
pub struct DataSource<R: DataReader> {
    reader: Arc<R>,
    /// Absolute byte offset into the reader where this view starts.
    offset: u64,
    len: u64,
}

impl<R: DataReader> DataSource<R> {
    /// Create a DataSource from a shared DataReader.
    pub fn from_reader(reader: Arc<R>) -> Self {
        let len = reader.size();
        Self {
            reader,
            offset: 0,
            len,
        }
    }

    /// Number of bytes in this view.
    #[inline]
    pub fn size(&self) -> u64 {
        self.len
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Absolute offset of this view's start within the original reader.
    /// Used for error messages and byte-range tracking.
    #[inline]
    pub fn base_offset(&self) -> u64 {
        self.offset
    }

    /// Extract a sub-view at the given offset and length. No I/O occurs.
    pub fn get_at(&self, offset: u64, len: u64) -> Result<Self> {
        let end = offset + len;
        if end > self.len {
            return Err(self.range_error(offset, end));
        }
        Ok(Self {
            reader: self.reader.clone(),
            offset: self.offset + offset,
            len,
        })
    }

    /// Extract a sub-view using a range. No I/O occurs.
    pub fn get<RB: std::ops::RangeBounds<u64>>(&self, range: RB) -> Result<Self> {
        use std::ops::Bound::*;

        let from = match range.start_bound() {
            Included(&i) => i,
            Excluded(&i) => i + 1,
            Unbounded => 0,
        };

        let to = match range.end_bound() {
            Included(&i) => i + 1,
            Excluded(&i) => i,
            Unbounded => self.len,
        };

        if from > to || to > self.len {
            return Err(self.range_error(from, to));
        }

        Ok(Self {
            reader: self.reader.clone(),
            offset: self.offset + from,
            len: to - from,
        })
    }

    /// Apply `f` to the bytes at a relative offset within this view.
    /// Zero-copy for mmap/in-memory readers; allocates a temp buffer for external readers.
    pub async fn read_at<F, T>(&self, offset: u64, len: usize, f: F) -> Result<T>
    where
        F: FnOnce(&[u8]) -> T,
    {
        let end = offset + len as u64;
        if end > self.len {
            return Err(self.range_error(offset, end));
        }
        let abs_offset = self.offset + offset;
        self.reader.read_at(abs_offset, len, f).await
    }

    /// Materialize the bytes in this view as an owned vector.
    pub async fn to_bytes(&self) -> Result<Vec<u8>> {
        let n = self.len as usize;
        self.reader.read_at(self.offset, n, |b| b.to_vec()).await
    }

    /// Parse a little-endian primitive value from this view.
    pub async fn as_le<O>(&self) -> Result<O>
    where
        O: endiannezz::Primitive,
        for<'a> <O as endiannezz::Primitive>::Buf: TryFrom<&'a [u8]>,
    {
        let n = self.len as usize;
        self.reader
            .read_at(self.offset, n, |bytes| {
                let fixed_buf = bytes.try_into().map_err(|_| {
                    eyre!(
                        "Unable to parse {} (little-endian) from range of len {} (expected len: {})",
                        std::any::type_name::<O>(),
                        bytes.len(),
                        std::mem::size_of::<O>()
                    )
                })?;
                Ok(O::from_le_bytes(fixed_buf))
            })
            .await?
    }

    /// Parse a typed value from this view's bytes.
    pub async fn try_get<O, E>(&self) -> Result<O>
    where
        O: for<'a> TryFrom<&'a [u8], Error = E>,
        E: std::error::Error + Send + Sync + 'static,
    {
        let n = self.len as usize;
        self.reader
            .read_at(self.offset, n, |bytes| {
                bytes.try_into().map_err(|e: E| {
                    eyre::Report::new(e)
                        .wrap_err(format!("Unable to parse {}", std::any::type_name::<O>()))
                })
            })
            .await?
    }

    /// Advance the start of this view by `prefix_size` bytes.
    pub fn remove_prefix(&mut self, prefix_size: u64) {
        assert!(
            prefix_size <= self.len,
            "remove_prefix({}) exceeds size ({})",
            prefix_size,
            self.len,
        );
        self.offset += prefix_size;
        self.len -= prefix_size;
    }

    fn range_error(&self, from: u64, to: u64) -> eyre::Report {
        let abs_from = self.offset + from;
        let abs_to = self.offset + to;
        let abs_start = self.offset;
        let abs_end = self.offset + self.len;

        let mut message = format!(
            "Unable to get subrange {}..{}, valid range is {}..{}",
            abs_from, abs_to, abs_start, abs_end,
        );

        let full_size = self.reader.size();
        if self.offset != 0 || self.offset + self.len != full_size {
            use std::fmt::Write as _;
            write!(&mut message, " (of 0..{})", full_size).unwrap();
        }

        eyre!(message)
    }
}

impl DataSource<Vec<u8>> {
    /// Create a DataSource from an owned byte vector.
    pub fn from_bytes(bytes: Vec<u8>) -> Self {
        let len = bytes.len() as u64;
        Self {
            reader: Arc::new(bytes),
            offset: 0,
            len,
        }
    }
}

#[cfg(feature = "fs")]
impl DataSource<memmap2::Mmap> {
    /// Create a DataSource from a memory-mapped file.
    pub fn from_file(file: std::fs::File) -> Result<Self> {
        let mapped = unsafe { memmap2::Mmap::map(&file) }?;
        Ok(Self::from_reader(Arc::new(mapped)))
    }
}

#[cfg(feature = "fs")]
impl DataSource<MultiReader<memmap2::Mmap>> {
    /// Create a DataSource from multiple memory-mapped files (e.g. pck + pkx + pkx1 + ...).
    pub fn from_files(files: Vec<std::fs::File>) -> Result<Self> {
        let readers: Vec<Arc<memmap2::Mmap>> = files
            .into_iter()
            .map(|f| -> Result<Arc<memmap2::Mmap>> {
                Ok(Arc::new(unsafe { memmap2::Mmap::map(&f) }?))
            })
            .collect::<Result<_>>()?;
        Ok(Self::composite(readers))
    }
}

impl<R: DataReader> DataSource<MultiReader<R>> {
    /// Create a DataSource backed by consecutive readers (e.g. pck + pkx + pkx1 + ...).
    pub fn composite(parts: Vec<Arc<R>>) -> Self {
        let multi = Arc::new(MultiReader::new(parts));
        Self::from_reader(multi)
    }
}

impl<R: DataReader> std::fmt::Debug for DataSource<R> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DataSource")
            .field("offset", &self.offset)
            .field("size", &self.len)
            .finish()
    }
}

#[cfg(test)]
impl<R: DataReader> DataSource<R> {
    pub fn to_bytes_blocking(&self) -> Result<Vec<u8>> {
        pollster::block_on(self.to_bytes())
    }

    pub fn as_le_blocking<O>(&self) -> Result<O>
    where
        O: endiannezz::Primitive,
        for<'a> <O as endiannezz::Primitive>::Buf: TryFrom<&'a [u8]>,
    {
        pollster::block_on(self.as_le())
    }

    pub fn try_get_blocking<O, E>(&self) -> Result<O>
    where
        O: for<'a> TryFrom<&'a [u8], Error = E>,
        E: std::error::Error + Send + Sync + 'static,
    {
        pollster::block_on(self.try_get())
    }
}

#[cfg(test)]
impl<R: DataReader> PartialEq for DataSource<R> {
    fn eq(&self, other: &Self) -> bool {
        if self.len != other.len {
            return false;
        }
        match (self.to_bytes_blocking(), other.to_bytes_blocking()) {
            (Ok(a), Ok(b)) => a == b,
            _ => false,
        }
    }
}

#[cfg(test)]
impl<R: DataReader> Eq for DataSource<R> {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_bytes_basic() {
        let ds = DataSource::from_bytes(b"hello".to_vec());
        assert_eq!(ds.size(), 5);
        assert!(!ds.is_empty());
        assert_eq!(ds.base_offset(), 0);
        assert_eq!(ds.to_bytes_blocking().unwrap(), b"hello");
    }

    #[test]
    fn empty() {
        let ds = DataSource::from_bytes(vec![]);
        assert_eq!(ds.size(), 0);
        assert!(ds.is_empty());
    }

    #[test]
    fn get_at() {
        let ds = DataSource::from_bytes(b"hello world".to_vec());
        let sub = ds.get_at(6, 5).unwrap();
        assert_eq!(sub.to_bytes_blocking().unwrap(), b"world");
        assert_eq!(sub.base_offset(), 6);
        assert_eq!(sub.size(), 5);
    }

    #[test]
    fn get_range() {
        let ds = DataSource::from_bytes(b"12345".to_vec());
        assert_eq!(ds.get(..).unwrap().to_bytes_blocking().unwrap(), b"12345");
        assert_eq!(ds.get(2..).unwrap().to_bytes_blocking().unwrap(), b"345");
        assert_eq!(ds.get(..3).unwrap().to_bytes_blocking().unwrap(), b"123");
        assert_eq!(ds.get(3..3).unwrap().to_bytes_blocking().unwrap(), b"");
    }

    #[test]
    fn get_out_of_bounds() {
        let ds = DataSource::from_bytes(b"12345".to_vec());
        assert!(ds.get(0..10).is_err());
        assert!(ds.get(10..).is_err());
        assert!(ds.get_at(0, 6).is_err());
    }

    #[test]
    fn error_messages() {
        let ds = DataSource::from_bytes(b"123456789".to_vec());

        assert_eq!(
            ds.get(..100).unwrap_err().to_string(),
            "Unable to get subrange 0..100, valid range is 0..9"
        );

        assert_eq!(
            ds.get(..3).unwrap().get(..5).unwrap_err().to_string(),
            "Unable to get subrange 0..5, valid range is 0..3 (of 0..9)"
        );

        assert_eq!(
            ds.get(1..).unwrap().get(1..100).unwrap_err().to_string(),
            "Unable to get subrange 2..101, valid range is 1..9 (of 0..9)"
        );
    }

    #[test]
    fn chained_get() {
        let ds = DataSource::from_bytes(b"123456789".to_vec());
        let v = ds
            .get(1..)
            .unwrap()
            .get(1..)
            .unwrap()
            .get(1..)
            .unwrap()
            .get(1..)
            .unwrap()
            .get(1..)
            .unwrap()
            .get(1..)
            .unwrap()
            .get(1..)
            .unwrap()
            .get(1..)
            .unwrap();
        assert_eq!(v.size(), 1);
        assert_eq!(v.to_bytes_blocking().unwrap(), b"9");

        assert!(v.get(1..).unwrap().get(1..).is_err());
    }

    #[test]
    fn as_le_u32() {
        let ds = DataSource::from_bytes(b"\x01\x02\x03\x04".to_vec());
        assert_eq!(ds.as_le_blocking::<u32>().unwrap(), 0x04030201);
    }

    #[test]
    fn as_le_wrong_size() {
        assert!(
            DataSource::from_bytes(vec![])
                .as_le_blocking::<u32>()
                .is_err()
        );
        assert!(
            DataSource::from_bytes(vec![1])
                .as_le_blocking::<u32>()
                .is_err()
        );
        assert!(
            DataSource::from_bytes(vec![1; 5])
                .as_le_blocking::<u32>()
                .is_err()
        );
    }

    #[test]
    fn as_le_types() {
        assert!(
            DataSource::from_bytes(vec![])
                .as_le_blocking::<u8>()
                .is_err()
        );
        assert_eq!(
            DataSource::from_bytes(vec![1])
                .as_le_blocking::<u8>()
                .unwrap(),
            1
        );
        assert_eq!(
            DataSource::from_bytes(b"\x01\x02".to_vec())
                .as_le_blocking::<u16>()
                .unwrap(),
            0x201
        );
        assert_eq!(
            DataSource::from_bytes(b"\x01\x02".to_vec())
                .as_le_blocking::<i16>()
                .unwrap(),
            0x201
        );
    }

    #[test]
    fn remove_prefix() {
        let mut ds = DataSource::from_bytes(b"hello world".to_vec());
        ds.remove_prefix(6);
        assert_eq!(ds.size(), 5);
        assert_eq!(ds.base_offset(), 6);
        assert_eq!(ds.to_bytes_blocking().unwrap(), b"world");
    }

    #[test]
    #[should_panic(expected = "remove_prefix(10) exceeds size (5)")]
    fn remove_prefix_overflow() {
        let mut ds = DataSource::from_bytes(b"hello".to_vec());
        ds.remove_prefix(10);
    }

    #[test]
    fn clone_independence() {
        let ds = DataSource::from_bytes(b"hello".to_vec());
        let mut clone = ds.clone();
        clone.remove_prefix(3);
        assert_eq!(ds.size(), 5);
        assert_eq!(clone.size(), 2);
    }

    #[test]
    fn multi_reader_single() {
        let a: Arc<Vec<u8>> = Arc::new(b"hello".to_vec());
        let ds = DataSource::composite(vec![a]);
        assert_eq!(ds.size(), 5);
        assert_eq!(ds.to_bytes_blocking().unwrap(), b"hello");
    }

    #[test]
    fn multi_reader_two_parts() {
        let a: Arc<Vec<u8>> = Arc::new(b"hello ".to_vec());
        let b: Arc<Vec<u8>> = Arc::new(b"world".to_vec());
        let ds = DataSource::composite(vec![a, b]);

        assert_eq!(ds.size(), 11);
        assert_eq!(ds.to_bytes_blocking().unwrap(), b"hello world");

        assert_eq!(
            ds.get_at(0, 5).unwrap().to_bytes_blocking().unwrap(),
            b"hello"
        );
        assert_eq!(
            ds.get_at(6, 5).unwrap().to_bytes_blocking().unwrap(),
            b"world"
        );
        // Spanning both parts
        assert_eq!(
            ds.get_at(3, 5).unwrap().to_bytes_blocking().unwrap(),
            b"lo wo"
        );
    }

    #[test]
    fn multi_reader_three_parts() {
        let a: Arc<Vec<u8>> = Arc::new(b"aaa".to_vec());
        let b: Arc<Vec<u8>> = Arc::new(b"bbb".to_vec());
        let c: Arc<Vec<u8>> = Arc::new(b"ccc".to_vec());
        let ds = DataSource::composite(vec![a, b, c]);

        assert_eq!(ds.size(), 9);
        assert_eq!(ds.to_bytes_blocking().unwrap(), b"aaabbbccc");

        assert_eq!(
            ds.get_at(2, 5).unwrap().to_bytes_blocking().unwrap(),
            b"abbbc"
        );
        assert_eq!(
            ds.get_at(3, 3).unwrap().to_bytes_blocking().unwrap(),
            b"bbb"
        );
        assert_eq!(
            ds.get_at(6, 3).unwrap().to_bytes_blocking().unwrap(),
            b"ccc"
        );
    }

    #[test]
    fn multi_reader_out_of_bounds() {
        let a: Arc<Vec<u8>> = Arc::new(b"ab".to_vec());
        let b: Arc<Vec<u8>> = Arc::new(b"cd".to_vec());
        let ds = DataSource::composite(vec![a, b]);
        assert!(ds.get_at(0, 5).is_err());
    }

    #[test]
    fn try_get() {
        let ds = DataSource::from_bytes(b"\x01\x02\x03\x04".to_vec());
        let arr: [u8; 4] = ds.try_get_blocking().unwrap();
        assert_eq!(arr, [1, 2, 3, 4]);
    }

    #[test]
    fn equality() {
        let a = DataSource::from_bytes(b"hello".to_vec());
        let b = DataSource::from_bytes(b"hello".to_vec());
        let c = DataSource::from_bytes(b"world".to_vec());
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn from_reader() {
        let data: Arc<Vec<u8>> = Arc::new(b"test data".to_vec());
        let ds = DataSource::from_reader(data);
        assert_eq!(ds.size(), 9);
        assert_eq!(ds.to_bytes_blocking().unwrap(), b"test data");
    }
}
