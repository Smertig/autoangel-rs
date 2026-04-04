use crate::util::DropLeadingZeros;
use crate::util::data_source::DataSource;
use eyre::{Context, Result, eyre};
use std::borrow::Cow;
use std::convert::TryInto;
use std::io::{Seek, Write};
#[cfg(feature = "fs")]
use std::path::Path;
use subslice::SubsliceExt;

#[derive(Debug, Eq, PartialEq, Default)]
struct KeyHeader {
    key1: u32,
    headers_end_offset: u32,
    key2: u32,
}

impl KeyHeader {
    const SIZE: usize = 12;

    fn parse(data: &DataSource) -> Result<Self> {
        Ok(KeyHeader {
            key1: data.get(0..4)?.as_le()?,
            headers_end_offset: data.get(4..8)?.as_le()?,
            key2: data.get(8..12)?.as_le()?,
        })
    }

    fn save<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(&self.key1.to_le_bytes())?;
        writer.write_all(&self.headers_end_offset.to_le_bytes())?;
        writer.write_all(&self.key2.to_le_bytes())?;
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PckVersion {
    V2,
    V3,
}

impl PckVersion {
    fn from_raw(version: u32) -> Result<Self> {
        match version {
            // v2.0.1 and v2.0.2 differ only in the "safe header" check tag; binary layout is identical
            0x20001 | 0x20002 => Ok(PckVersion::V2),
            0x20003 => Ok(PckVersion::V3),
            v => Err(eyre!("Unknown version: {v:X}")),
        }
    }

    /// Compute the 64-bit XOR key for entry_offset encryption.
    /// v2 uses the 32-bit key zero-extended to 64-bit.
    /// v3 sign-extends it (matching the Angelica Engine behavior).
    fn entry_offset_key(self, key1: u32) -> u64 {
        match self {
            PckVersion::V2 => key1 as u64,
            PckVersion::V3 => key1 as i32 as i64 as u64,
        }
    }
}

#[derive(Debug)]
struct PackageMetaHeader {
    file_count: u32,
    version: u32,
}

impl PackageMetaHeader {
    const SIZE: usize = 8;

    fn parse(data: &DataSource) -> Result<Self> {
        Ok(PackageMetaHeader {
            file_count: data.get(0..4)?.as_le()?,
            version: data.get(4..8)?.as_le()?,
        })
    }

    fn save<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(&self.file_count.to_le_bytes())?;
        writer.write_all(&self.version.to_le_bytes())?;
        Ok(())
    }
}

#[derive(Debug, Eq, PartialEq)]
struct PackageHeader {
    guard1: u32,
    version: u32,
    entry_offset: u64,
    flags: u32,
    description: [u8; 252],
    guard2: u32,
}

impl PackageHeader {
    const SIZE_V2: usize = 272;
    // v3 adds 4 bytes for entry_offset (u64 vs u32) and 4 bytes trailing UNKNOWN after guard2
    const SIZE_V3: usize = 280;

    fn size_for_version(version: PckVersion) -> usize {
        match version {
            PckVersion::V2 => Self::SIZE_V2,
            PckVersion::V3 => Self::SIZE_V3,
        }
    }

    fn parse(data: &DataSource, version: PckVersion) -> Result<Self> {
        let extra = match version {
            PckVersion::V2 => 0,
            PckVersion::V3 => 4,
        };
        Ok(PackageHeader {
            guard1: data.get(0..4)?.as_le()?,
            version: data.get(4..8)?.as_le()?,
            entry_offset: match version {
                PckVersion::V2 => data.get(8..12)?.as_le::<u32>()? as u64,
                PckVersion::V3 => data.get(8..16)?.as_le::<u64>()?,
            },
            flags: data.get(12 + extra..16 + extra)?.as_le()?,
            description: data.get(16 + extra..268 + extra)?.try_get()?,
            guard2: data.get(268 + extra..272 + extra)?.as_le()?,
            // v3 has 4 trailing bytes (UNKNOWN) after guard2, skipped on parse
        })
    }

    fn save<W: Write>(&self, writer: &mut W, version: PckVersion) -> Result<()> {
        writer.write_all(&self.guard1.to_le_bytes())?;
        writer.write_all(&self.version.to_le_bytes())?;
        match version {
            PckVersion::V2 => {
                let offset: u32 = self.entry_offset.try_into().map_err(|_| {
                    eyre!(
                        "Entry offset {} exceeds u32 range for v2 format",
                        self.entry_offset
                    )
                })?;
                writer.write_all(&offset.to_le_bytes())?;
            }
            PckVersion::V3 => writer.write_all(&self.entry_offset.to_le_bytes())?,
        }
        writer.write_all(&self.flags.to_le_bytes())?;
        writer.write_all(&self.description)?;
        writer.write_all(&self.guard2.to_le_bytes())?;
        if version == PckVersion::V3 {
            writer.write_all(&0u32.to_le_bytes())?;
        }
        Ok(())
    }
}

#[derive(Debug)]
struct FileGbkEntry {
    filename: [u8; 260],
    offset: u64,
    size: u32,
    compressed_size: u32,
}

impl FileGbkEntry {
    const SIZE_V2: usize = 276;
    const SIZE_V2_WITHOUT_RESERVED: usize = 272;
    const SIZE_V3: usize = 288;

    fn min_parse_size(version: PckVersion) -> usize {
        match version {
            PckVersion::V2 => Self::SIZE_V2_WITHOUT_RESERVED,
            PckVersion::V3 => Self::SIZE_V3,
        }
    }

    fn save_size(version: PckVersion) -> usize {
        match version {
            PckVersion::V2 => Self::SIZE_V2,
            PckVersion::V3 => Self::SIZE_V3,
        }
    }

    fn parse(data: &DataSource, version: PckVersion) -> Result<Self> {
        match version {
            PckVersion::V2 => {
                if data.size() != Self::SIZE_V2 && data.size() != Self::SIZE_V2_WITHOUT_RESERVED {
                    eyre::bail!(
                        "Invalid FileGbkEntry size: got {}, expected {} or {}",
                        data.size(),
                        Self::SIZE_V2_WITHOUT_RESERVED,
                        Self::SIZE_V2
                    );
                }
                Ok(FileGbkEntry {
                    filename: data.get(0..260)?.try_get()?,
                    offset: data.get(260..264)?.as_le::<u32>()? as u64,
                    size: data.get(264..268)?.as_le::<u32>()?,
                    compressed_size: data.get(268..272)?.as_le::<u32>()?,
                })
            }
            PckVersion::V3 => {
                if data.size() != Self::SIZE_V3 {
                    eyre::bail!(
                        "Invalid FileGbkEntry size: got {}, expected {}",
                        data.size(),
                        Self::SIZE_V3
                    );
                }
                Ok(FileGbkEntry {
                    filename: data.get(0..260)?.try_get()?,
                    offset: data.get(264..272)?.as_le::<u64>()?,
                    size: data.get(272..276)?.as_le::<u32>()?,
                    compressed_size: data.get(276..280)?.as_le::<u32>()?,
                })
            }
        }
    }

    fn save<W: Write>(&self, writer: &mut W, version: PckVersion) -> Result<()> {
        writer.write_all(&self.filename)?;
        match version {
            PckVersion::V2 => {
                let offset: u32 = self.offset.try_into().map_err(|_| {
                    eyre!(
                        "File offset {} exceeds u32 range for v2 format",
                        self.offset
                    )
                })?;
                writer.write_all(&offset.to_le_bytes())?;
                writer.write_all(&self.size.to_le_bytes())?;
                writer.write_all(&self.compressed_size.to_le_bytes())?;
                writer.write_all(&[0u8; 4])?;
            }
            PckVersion::V3 => {
                writer.write_all(&0u32.to_le_bytes())?;
                writer.write_all(&self.offset.to_le_bytes())?;
                writer.write_all(&self.size.to_le_bytes())?;
                writer.write_all(&self.compressed_size.to_le_bytes())?;
                writer.write_all(&[0u8; 8])?;
            }
        }
        Ok(())
    }
}

#[derive(Debug)]
pub struct FileEntry {
    original_name: String,
    pub normalized_name: String,
    offset: u64,
    size: u32,
    compressed_size: u32,
}

impl FileEntry {
    pub fn normalize_path(path: &str) -> String {
        path.replace('/', r"\").to_lowercase()
    }

    pub fn get_raw_file_bytes<'a>(&self, content: &'a DataSource) -> Result<Cow<'a, [u8]>> {
        let offset = self.offset as usize;
        let compressed_size = self.compressed_size as usize;

        content.read_bytes_at(offset, compressed_size)
    }
}

impl TryInto<FileEntry> for FileGbkEntry {
    type Error = eyre::Error;

    fn try_into(self) -> Result<FileEntry, Self::Error> {
        use encoding::*;

        let original_name = all::GBK
            .decode(self.filename.drop_leading_zeros(), DecoderTrap::Strict)
            .map_err(|s| eyre!("Decoding error: {s}"))?;

        let normalized_name = FileEntry::normalize_path(&original_name);

        Ok(FileEntry {
            original_name,
            normalized_name,
            offset: self.offset,
            size: self.size,
            compressed_size: self.compressed_size,
        })
    }
}

#[derive(Debug)]
pub struct PackageInfo {
    meta_header: PackageMetaHeader,
    key_header: KeyHeader,
    package_header: PackageHeader,
    files: Vec<FileEntry>,
}

#[derive(Clone)]
pub struct PackageConfig {
    pub key1: u32,
    pub key2: u32,
    pub guard1: u32,
    pub guard2: u32,
}

impl Default for PackageConfig {
    fn default() -> Self {
        Self {
            key1: 0xA8937462,
            key2: 0x59374231,
            guard1: 0xFDFDFEEE,
            guard2: 0xF00DBEEF,
        }
    }
}

impl PackageInfo {
    pub fn version(&self) -> u32 {
        self.meta_header.version
    }

    pub fn file_count(&self) -> usize {
        self.files.len()
    }

    #[cfg(feature = "fs")]
    pub fn save<P: AsRef<Path>>(
        &self,
        content: &DataSource,
        path: P,
        config: &PackageConfig,
    ) -> Result<()> {
        let mut file = std::fs::File::create(path)?;
        self.save_to(content, &mut file, config)
    }

    pub fn save_to<W: Write + Seek>(
        &self,
        content: &DataSource,
        writer: &mut W,
        config: &PackageConfig,
    ) -> Result<()> {
        let version = PckVersion::from_raw(self.meta_header.version)?;
        let mut current_offset: u64 = 0;

        // Placeholder header, overwritten after we know the final size
        KeyHeader::default().save(writer)?;
        current_offset += KeyHeader::SIZE as u64;

        let mut new_entries = Vec::new();

        for old_entry in &self.files {
            use encoding::*;

            let compressed = old_entry.get_raw_file_bytes(content)?;

            writer.write_all(&compressed)?;

            fn add_leading_zeros<const N: usize>(bytes: &[u8]) -> Result<[u8; N]> {
                assert!(N > 0);
                if bytes.len() > N - 1 {
                    eyre::bail!("Slice is too big ({} > {})", bytes.len(), N - 1);
                }

                let mut result = [0u8; N];
                result[..bytes.len()].copy_from_slice(bytes);
                Ok(result)
            }

            let encoded_name = all::GBK
                .encode(&old_entry.original_name, EncoderTrap::Strict)
                .map_err(|s| eyre!("Decoding error: {s}"))?;

            let compressed_size = compressed.len();

            new_entries.push(FileGbkEntry {
                filename: add_leading_zeros(&encoded_name)?,
                offset: current_offset,
                size: old_entry.size,
                compressed_size: compressed_size as u32,
            });

            current_offset += compressed_size as u64;
        }

        let entry_table_offset = current_offset;
        let entry_save_size = FileGbkEntry::save_size(version);
        let mut entry_buf = vec![0u8; entry_save_size];

        for new_entry in &new_entries {
            {
                let mut cursor = &mut entry_buf[..];
                new_entry.save(&mut cursor, version)?;
            }

            let compressed_entry = compress_package_entry(&entry_buf, 3);
            let compressed_size = compressed_entry.len() as u32;

            writer.write_all(&(compressed_size ^ config.key1).to_le_bytes())?;
            writer.write_all(&(compressed_size ^ config.key1 ^ config.key2).to_le_bytes())?;
            writer.write_all(&compressed_entry)?;
        }

        let meta_header = PackageMetaHeader {
            version: self.meta_header.version,
            file_count: new_entries.len() as u32,
        };

        let entry_offset = entry_table_offset ^ version.entry_offset_key(config.key1);
        let package_header = PackageHeader {
            guard1: config.guard1,
            version: self.meta_header.version,
            entry_offset,
            flags: self.package_header.flags,
            description: self.package_header.description,
            guard2: config.guard2,
        };

        package_header.save(writer, version)?;
        meta_header.save(writer)?;

        let end_offset = writer.stream_position()? as u32;

        let key_header = KeyHeader {
            key1: self.key_header.key1,
            headers_end_offset: end_offset,
            key2: self.key_header.key2,
        };

        {
            let old_position = writer.stream_position()?;
            writer.seek(std::io::SeekFrom::Start(0))?;
            key_header.save(writer)?;
            writer.seek(std::io::SeekFrom::Start(old_position))?;
        }

        Ok(())
    }

    pub fn parse(data: &DataSource, config: PackageConfig) -> Result<Self> {
        let key_header = KeyHeader::parse(data)?;

        let headers_end_offset = key_header.headers_end_offset as usize;

        if headers_end_offset < 4 {
            eyre::bail!("Invalid headers_end_offset: {}", headers_end_offset);
        }

        let raw_version = data
            .get(headers_end_offset - 4..headers_end_offset)?
            .as_le::<u32>()?;
        let version = PckVersion::from_raw(raw_version)?;

        let package_header_size = PackageHeader::size_for_version(version);

        if headers_end_offset < PackageMetaHeader::SIZE + package_header_size {
            eyre::bail!(
                "Invalid headers_end_offset: {} (minimum is {})",
                headers_end_offset,
                PackageMetaHeader::SIZE + package_header_size
            );
        }

        let meta_header_offset = headers_end_offset - PackageMetaHeader::SIZE;
        let header_offset = meta_header_offset - package_header_size;

        let meta_header = PackageMetaHeader::parse(
            &data
                .get_at(meta_header_offset, PackageMetaHeader::SIZE)
                .wrap_err_with(|| eyre!("Invalid meta-header position"))?,
        )?;

        let package_header =
            PackageHeader::parse(&data.get_at(header_offset, package_header_size)?, version)?;

        if package_header
            .description
            .find(b"lica File Package")
            .is_none()
        {
            eyre::bail!("Invalid description");
        }

        let is_encrypted = (package_header.flags & 0x8000_0000_u32) != 0;
        if is_encrypted {
            eyre::bail!("Not implemented: package is encrypted");
        }

        if package_header.guard1 != config.guard1 {
            eyre::bail!(
                "Invalid guard1: expected {expected:08X}, got {parsed:08X}",
                expected = config.guard1,
                parsed = package_header.guard1,
            );
        }

        if package_header.guard2 != config.guard2 {
            eyre::bail!(
                "Invalid guard2: expected {expected:08X}, got {parsed:08X}",
                expected = config.guard2,
                parsed = package_header.guard2,
            );
        }

        let entry_offset =
            (package_header.entry_offset ^ version.entry_offset_key(config.key1)) as usize;
        let mut offset = entry_offset;

        let min_entry_size = FileGbkEntry::min_parse_size(version);

        let mut files = (0..meta_header.file_count)
            .map(|i| -> Result<FileEntry> {
                let first_size = data.get_at(offset, 4)?.as_le::<u32>()? ^ config.key1;
                offset += 4;

                let second_size = data.get_at(offset, 4)?.as_le::<u32>()? ^ config.key1 ^ config.key2;
                offset += 4;

                if first_size != second_size {
                    eyre::bail!("Invalid decoded compressed size: {0:08X} != {1:08X}", first_size, second_size);
                }

                let size = first_size as usize;
                let entry_data = data.get_at(offset, size)?;
                let entry_bytes = entry_data.to_bytes()?;
                offset += size;

                let decoded_entry = decompress_package_entry(&entry_bytes)
                    .map_err(|e| eyre!("Decompression failed with {:?}", e))?;

                if decoded_entry.len() < min_entry_size {
                    eyre::bail!(
                        "Invalid decompressed entry: compressed size of #{} is {} bytes, decompressed is {} bytes (expected at least {} bytes)",
                        i,
                        size,
                        decoded_entry.len(),
                        min_entry_size
                    );
                }

                let gbk_entry = FileGbkEntry::parse(&DataSource::from_bytes(decoded_entry), version)?;
                let decoded_entry = gbk_entry.try_into()?;
                Ok(decoded_entry)
            })
            .collect::<Result<Vec<_>, _>>()?;

        // TODO: remove sort? keep files non-sorted until requested?
        files.sort_by(|l, r| l.normalized_name.cmp(&r.normalized_name));

        Ok(PackageInfo {
            meta_header,
            key_header,
            package_header,
            files,
        })
    }

    pub fn find_prefix(&self, prefix: &str) -> &[FileEntry] {
        let prefix = FileEntry::normalize_path(prefix);

        let start_index = self
            .files
            .binary_search_by(|e| e.normalized_name.cmp(&prefix))
            .unwrap_or_else(|index| index);

        let mut end_index = start_index;
        while end_index < self.files.len()
            && self.files[end_index].normalized_name.starts_with(&prefix)
        {
            end_index += 1;
        }

        if start_index != end_index {
            &self.files[start_index..end_index]
        } else {
            &[]
        }
    }

    pub fn get_file<'a>(&self, content: &'a DataSource, path: &str) -> Option<Cow<'a, [u8]>> {
        let path = FileEntry::normalize_path(path);

        let entry = match self
            .files
            .binary_search_by(|e| e.normalized_name.cmp(&path))
        {
            Ok(index) => &self.files[index],
            Err(_) => return None,
        };

        let offset = entry.offset as usize;
        let compressed_size = entry.compressed_size as usize;

        let compressed = match content.read_bytes_at(offset, compressed_size) {
            Ok(data) => data,
            Err(_) => return None,
        };

        if entry.compressed_size >= entry.size {
            return Some(compressed);
        }

        match miniz_oxide::inflate::decompress_to_vec_zlib(&compressed) {
            Ok(result) => Some(Cow::Owned(result)),
            Err(_) => None,
        }
    }
}

fn compress_package_entry(data: &[u8], level: i32) -> Vec<u8> {
    miniz_oxide::deflate::compress_to_vec_zlib(data, level as u8)
}

fn decompress_package_entry(
    compressed: &[u8],
) -> Result<Vec<u8>, miniz_oxide::inflate::DecompressError> {
    miniz_oxide::inflate::decompress_to_vec_zlib(compressed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::include_test_data_bytes;

    fn ds(bytes: &[u8]) -> DataSource {
        DataSource::from_bytes(bytes.to_vec())
    }

    #[test]
    fn parse_key_header() {
        assert!(KeyHeader::parse(&ds(b"")).is_err());
        assert!(KeyHeader::parse(&ds(b"\x00\x00\x00\x00")).is_err());
        assert_eq!(
            KeyHeader::parse(&ds(b"\x01\x00\x00\x00\x02\x00\x00\x00\x03\x00\x00\x00")).unwrap(),
            KeyHeader {
                key1: 1,
                headers_end_offset: 2,
                key2: 3
            }
        );
    }

    #[test]
    fn parse_package_header() {
        assert!(PackageHeader::parse(&ds(b""), PckVersion::V2).is_err());
        assert!(PackageHeader::parse(&ds(b"123"), PckVersion::V2).is_err());
        assert_eq!(
            PackageHeader::parse(
                &ds(b"\x01\x00\x00\x00\x02\x00\x00\x00\x03\x00\x00\x00\x04\x00\x00\x00\
                       Hello, world\
                       \x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\
                       \x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\
                       \x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\
                       \x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\
                       \x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\
                       \x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\
                       \x05\x00\x00\x00"),
                PckVersion::V2
            )
                .unwrap(),
            PackageHeader {
                guard1: 1,
                version: 2,
                entry_offset: 3,
                flags: 4,
                description: ["Hello, world".as_bytes().to_vec(), vec![0u8; 240]].concat().try_into().unwrap(),
                guard2: 5,
            }
        );
    }

    #[test]
    fn parse_package_info() {
        let bytes = include_test_data_bytes!("packages/configs.pck");
        let package = PackageInfo::parse(&ds(bytes), Default::default()).unwrap();

        assert!(!package.files.is_empty());
    }

    #[test]
    fn find_prefix_empty_returns_all() {
        let bytes = include_test_data_bytes!("packages/configs.pck");
        let package = PackageInfo::parse(&ds(bytes), Default::default()).unwrap();

        assert_eq!(package.find_prefix("").len(), package.file_count());
    }

    fn configs_pck_bytes() -> Vec<u8> {
        include_test_data_bytes!("packages/configs.pck").to_vec()
    }

    fn headers_end_offset(data: &[u8]) -> usize {
        u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize
    }

    #[test]
    fn parse_truncated_input() {
        let config: PackageConfig = Default::default();
        assert!(PackageInfo::parse(&ds(b""), config.clone()).is_err());
        assert!(PackageInfo::parse(&ds(b"short"), config.clone()).is_err());
        assert!(PackageInfo::parse(&ds(&[0u8; 11]), config).is_err());
    }

    #[test]
    fn parse_invalid_headers_end_offset() {
        let mut data = vec![0u8; 512];
        // headers_end_offset = 100, which is less than PackageHeader::SIZE_V2 + PackageMetaHeader::SIZE_V2 = 280
        data[4..8].copy_from_slice(&100u32.to_le_bytes());
        // Set a valid version at offset 96..100 so the version check passes
        data[96..100].copy_from_slice(&0x20002u32.to_le_bytes());
        let config: PackageConfig = Default::default();
        let err = PackageInfo::parse(&DataSource::from_bytes(data), config).unwrap_err();
        assert!(
            err.to_string().contains("Invalid headers_end_offset"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn parse_unknown_version() {
        let mut data = configs_pck_bytes();
        let heo = headers_end_offset(&data);
        // version is at heo - 4 (last 4 bytes of PackageMetaHeader)
        let version_offset = heo - 4;
        data[version_offset..version_offset + 4].copy_from_slice(&0x99999u32.to_le_bytes());
        let config: PackageConfig = Default::default();
        let err = PackageInfo::parse(&DataSource::from_bytes(data), config).unwrap_err();
        assert!(
            err.to_string().contains("Unknown version"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn parse_invalid_description() {
        let mut data = configs_pck_bytes();
        let heo = headers_end_offset(&data);
        // PackageHeader starts at heo - 280, description starts at +16
        let desc_offset = heo - 280 + 16;
        // Zero out the description so it won't contain "lica File Package"
        data[desc_offset..desc_offset + 252].fill(0);
        let config: PackageConfig = Default::default();
        let err = PackageInfo::parse(&DataSource::from_bytes(data), config).unwrap_err();
        assert!(
            err.to_string().contains("Invalid description"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn parse_guard_mismatch() {
        let data = configs_pck_bytes();
        let config = PackageConfig {
            guard1: 0xDEADBEEF,
            ..Default::default()
        };
        let err = PackageInfo::parse(&ds(&data), config).unwrap_err();
        assert!(
            err.to_string().contains("Invalid guard1"),
            "unexpected error: {err}"
        );

        let config = PackageConfig {
            guard2: 0xDEADBEEF,
            ..Default::default()
        };
        let err = PackageInfo::parse(&ds(&data), config).unwrap_err();
        assert!(
            err.to_string().contains("Invalid guard2"),
            "unexpected error: {err}"
        );
    }
}
