use crate::util::DropLeadingZeros;
use crate::util::data_source::{DataReader, DataSource};
use crate::util::throttle::Throttle;
use eyre::{Context, Result, eyre};

use std::convert::TryInto;
use std::io::{Seek, Write};
#[cfg(feature = "fs")]
use std::path::Path;
use subslice::SubsliceExt;

#[derive(Debug)]
enum VersionProbe {
    Valid,
    PastEof,
    TooSmall,
    BadVersion(u32),
}

impl std::fmt::Display for VersionProbe {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VersionProbe::Valid => write!(f, "valid version"),
            VersionProbe::PastEof => write!(f, "past end of data"),
            VersionProbe::TooSmall => write!(f, "offset too small"),
            VersionProbe::BadVersion(v) => write!(f, "unknown version 0x{v:X}"),
        }
    }
}

#[derive(Debug, Default, Eq, PartialEq)]
pub(crate) struct KeyHeader {
    pub(crate) key1: u32,
    pub(crate) headers_end_offset: u64,
    pub(crate) key2: u32,
    /// True when the on-disk format uses a 64-bit offset (16 bytes total instead of 12).
    pub(crate) wide: bool,
}

impl KeyHeader {
    pub(crate) fn size(&self) -> usize {
        if self.wide { 16 } else { 12 }
    }

    async fn probe_version_at<R: DataReader>(data: &DataSource<R>, offset: u64) -> VersionProbe {
        if offset < 4 {
            return VersionProbe::TooSmall;
        }
        if offset > data.size() {
            return VersionProbe::PastEof;
        }
        let Ok(d) = data.get(offset - 4..offset) else {
            return VersionProbe::PastEof;
        };
        let Ok(ver) = d.as_le::<u32>().await else {
            return VersionProbe::PastEof;
        };
        match PckVersion::from_raw(ver) {
            Ok(_) => VersionProbe::Valid,
            Err(_) => VersionProbe::BadVersion(ver),
        }
    }

    async fn parse<R: DataReader>(data: &DataSource<R>) -> Result<Self> {
        let key1: u32 = data.get(0..4)?.as_le().await?;

        // Try 12-byte format (u32 offset)
        let offset_narrow: u64 = data.get(4..8)?.as_le::<u32>().await? as u64;
        let narrow = Self::probe_version_at(data, offset_narrow).await;
        if matches!(narrow, VersionProbe::Valid) {
            return Ok(KeyHeader {
                key1,
                headers_end_offset: offset_narrow,
                key2: data.get(8..12)?.as_le().await?,
                wide: false,
            });
        }

        // Try 16-byte format (u64 offset)
        let offset_wide: u64 = data.get(4..12)?.as_le().await?;
        let wide = Self::probe_version_at(data, offset_wide).await;
        if matches!(wide, VersionProbe::Valid) {
            return Ok(KeyHeader {
                key1,
                headers_end_offset: offset_wide,
                key2: data.get(12..16)?.as_le().await?,
                wide: true,
            });
        }

        // If either candidate offset lands past end-of-data, the archive is
        // almost certainly split across pck + pkx/pkx1/pkx2/... and the caller
        // only provided the .pck part. Surface this explicitly — the raw
        // "unknown version" path is usually misread as corruption.
        let data_size = data.size();
        let split_hint =
            matches!(narrow, VersionProbe::PastEof) || matches!(wide, VersionProbe::PastEof);
        let hint = if split_hint {
            "\n  Hint: at least one header offset points past end of data, which usually means \
             the archive is split across multiple files. Provide the .pkx/.pkx1/.pkx2/... \
             companions alongside the .pck and retry."
        } else {
            "\n  The file does not look like a valid PCK archive (neither header layout \
             resolves to a known version)."
        };

        eyre::bail!(
            "Cannot parse PCK key header (data size: {} bytes)\n  \
             - narrow 12-byte header: offset {} → {}\n  \
             - wide 16-byte header:   offset {} → {}{}",
            data_size,
            offset_narrow,
            narrow,
            offset_wide,
            wide,
            hint,
        )
    }

    pub(crate) fn save<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(&self.key1.to_le_bytes())?;
        if self.wide {
            writer.write_all(&self.headers_end_offset.to_le_bytes())?;
        } else {
            let offset: u32 = self.headers_end_offset.try_into().map_err(|_| {
                eyre!(
                    "Narrow key header cannot represent offset {}",
                    self.headers_end_offset
                )
            })?;
            writer.write_all(&offset.to_le_bytes())?;
        }
        writer.write_all(&self.key2.to_le_bytes())?;
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PckVersion {
    V2,
    V3,
}

impl PckVersion {
    pub(crate) fn from_raw(version: u32) -> Result<Self> {
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
    pub(crate) fn entry_offset_key(self, key1: u32) -> u64 {
        match self {
            PckVersion::V2 => key1 as u64,
            PckVersion::V3 => key1 as i32 as i64 as u64,
        }
    }
}

#[derive(Debug)]
pub(crate) struct PackageMetaHeader {
    pub(crate) file_count: u32,
    pub(crate) version: u32,
}

impl PackageMetaHeader {
    const SIZE: usize = 8;

    async fn parse<R: DataReader>(data: &DataSource<R>) -> Result<Self> {
        Ok(PackageMetaHeader {
            file_count: data.get(0..4)?.as_le().await?,
            version: data.get(4..8)?.as_le().await?,
        })
    }

    pub(crate) fn save<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer.write_all(&self.file_count.to_le_bytes())?;
        writer.write_all(&self.version.to_le_bytes())?;
        Ok(())
    }
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct PackageHeader {
    pub(crate) guard1: u32,
    pub(crate) version: u32,
    pub(crate) entry_offset: u64,
    pub(crate) flags: u32,
    pub(crate) description: [u8; 252],
    pub(crate) guard2: u32,
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

    async fn parse<R: DataReader>(data: &DataSource<R>, version: PckVersion) -> Result<Self> {
        let extra = match version {
            PckVersion::V2 => 0,
            PckVersion::V3 => 4,
        };
        Ok(PackageHeader {
            guard1: data.get(0..4)?.as_le().await?,
            version: data.get(4..8)?.as_le().await?,
            entry_offset: match version {
                PckVersion::V2 => data.get(8..12)?.as_le::<u32>().await? as u64,
                PckVersion::V3 => data.get(8..16)?.as_le::<u64>().await?,
            },
            flags: data.get(12 + extra..16 + extra)?.as_le().await?,
            description: data.get(16 + extra..268 + extra)?.try_get().await?,
            guard2: data.get(268 + extra..272 + extra)?.as_le().await?,
            // v3 has 4 trailing bytes (UNKNOWN) after guard2, skipped on parse
        })
    }

    pub(crate) fn save<W: Write>(&self, writer: &mut W, version: PckVersion) -> Result<()> {
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
pub(crate) struct FileGbkEntry {
    pub(crate) filename: [u8; 260],
    pub(crate) offset: u64,
    pub(crate) size: u32,
    pub(crate) compressed_size: u32,
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

    pub(crate) fn save_size(version: PckVersion) -> usize {
        match version {
            PckVersion::V2 => Self::SIZE_V2,
            PckVersion::V3 => Self::SIZE_V3,
        }
    }

    async fn parse<R: DataReader>(data: &DataSource<R>, version: PckVersion) -> Result<Self> {
        match version {
            PckVersion::V2 => {
                if data.size() != Self::SIZE_V2 as u64
                    && data.size() != Self::SIZE_V2_WITHOUT_RESERVED as u64
                {
                    eyre::bail!(
                        "Invalid FileGbkEntry size: got {}, expected {} or {}",
                        data.size(),
                        Self::SIZE_V2_WITHOUT_RESERVED,
                        Self::SIZE_V2
                    );
                }
                Ok(FileGbkEntry {
                    filename: data.get(0..260)?.try_get().await?,
                    offset: data.get(260..264)?.as_le::<u32>().await? as u64,
                    size: data.get(264..268)?.as_le::<u32>().await?,
                    compressed_size: data.get(268..272)?.as_le::<u32>().await?,
                })
            }
            PckVersion::V3 => {
                if data.size() != Self::SIZE_V3 as u64 {
                    eyre::bail!(
                        "Invalid FileGbkEntry size: got {}, expected {}",
                        data.size(),
                        Self::SIZE_V3
                    );
                }
                Ok(FileGbkEntry {
                    filename: data.get(0..260)?.try_get().await?,
                    offset: data.get(264..272)?.as_le::<u64>().await?,
                    size: data.get(272..276)?.as_le::<u32>().await?,
                    compressed_size: data.get(276..280)?.as_le::<u32>().await?,
                })
            }
        }
    }

    pub(crate) fn save<W: Write>(&self, writer: &mut W, version: PckVersion) -> Result<()> {
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
    pub(crate) original_name: String,
    pub normalized_name: String,
    pub(crate) offset: u64,
    pub(crate) size: u32,
    pub(crate) compressed_size: u32,
}

/// Summary of a file entry with compressed data hash, returned by [`PackageInfo::scan_entries`].
#[derive(Debug)]
pub struct FileEntrySummary<'a> {
    pub path: &'a str,
    pub size: u32,
    pub compressed_size: u32,
    /// CRC32 hash of the **compressed** (on-disk) data.
    pub hash: u32,
}

/// Callback that receives a chunk of scanned entries.
pub type ScanEntriesChunkFn<'a> = Box<dyn FnMut(&[FileEntrySummary<'a>]) -> Result<()> + 'a>;

/// Options for [`PackageInfo::scan_entries`].
pub struct ScanEntriesOptions<'a> {
    pub on_chunk: ScanEntriesChunkFn<'a>,
    pub interval_ms: u32,
}

/// Progress information passed to the callback during [`PackageInfo::parse`].
#[derive(Debug)]
pub struct ParseProgress {
    pub index: usize,
    pub total: usize,
}

/// Callback type for progress reporting in [`PackageInfo::parse`].
pub type ParseProgressFn = Box<dyn FnMut(ParseProgress) -> Result<()>>;

/// Options for [`PackageInfo::parse`].
#[derive(Default)]
pub struct ParseOptions {
    pub on_progress: Option<ParseProgressFn>,
    /// Minimum interval in milliseconds between progress callbacks.
    /// The first and last entries are always reported. Default `0` means no throttling.
    pub progress_interval_ms: u32,
}

impl FileEntry {
    pub fn normalize_path(path: &str) -> String {
        path.replace('/', r"\").to_lowercase()
    }

    /// Read and decompress the file content.
    pub async fn get_file<R: DataReader>(&self, content: &DataSource<R>) -> Option<Vec<u8>> {
        let compressed_size = self.compressed_size;
        let size = self.size;
        content
            .read_at(self.offset, compressed_size as usize, |compressed| {
                if compressed_size >= size {
                    Some(compressed.to_vec())
                } else {
                    miniz_oxide::inflate::decompress_to_vec_zlib(compressed).ok()
                }
            })
            .await
            .ok()?
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
    pub(crate) meta_header: PackageMetaHeader,
    pub(crate) key_header: KeyHeader,
    pub(crate) package_header: PackageHeader,
    pub(crate) files: Vec<FileEntry>,
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

/// Bundles a parsed package with its content source for shared ownership.
pub struct PackageSource<R: DataReader> {
    pub info: PackageInfo,
    pub content: DataSource<R>,
}

impl PackageInfo {
    pub fn version(&self) -> u32 {
        self.meta_header.version
    }

    pub fn file_count(&self) -> usize {
        self.files.len()
    }

    #[cfg(feature = "fs")]
    pub async fn save<R: DataReader, P: AsRef<Path>>(
        &self,
        content: &DataSource<R>,
        path: P,
        config: &PackageConfig,
    ) -> Result<()> {
        let mut file = std::fs::File::create(path)?;
        self.save_to(content, &mut file, config).await
    }

    pub async fn save_to<R: DataReader, W: Write + Seek>(
        &self,
        content: &DataSource<R>,
        writer: &mut W,
        config: &PackageConfig,
    ) -> Result<()> {
        let version = PckVersion::from_raw(self.meta_header.version)?;
        let mut current_offset: u64 = 0;

        // Placeholder header, overwritten after we know the final size.
        // Preserve the original format (narrow/wide) so round-trip is lossless.
        let key_header_template = KeyHeader {
            wide: self.key_header.wide,
            ..Default::default()
        };
        key_header_template.save(writer)?;
        current_offset += key_header_template.size() as u64;

        let mut new_entries = Vec::new();

        for old_entry in &self.files {
            content
                .read_at(old_entry.offset, old_entry.compressed_size as usize, |b| {
                    writer.write_all(b)
                })
                .await??;

            new_entries.push(FileGbkEntry {
                filename: pad_filename(&encode_gbk_filename(&old_entry.original_name)?)?,
                offset: current_offset,
                size: old_entry.size,
                compressed_size: old_entry.compressed_size,
            });

            current_offset += old_entry.compressed_size as u64;
        }

        let entry_table_offset = current_offset;
        write_entry_table(&new_entries, version, config, writer)?;

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

        let end_offset = writer.stream_position()?;

        let key_header = KeyHeader {
            key1: self.key_header.key1,
            headers_end_offset: end_offset,
            key2: self.key_header.key2,
            wide: self.key_header.wide,
        };

        {
            let old_position = writer.stream_position()?;
            writer.seek(std::io::SeekFrom::Start(0))?;
            key_header.save(writer)?;
            writer.seek(std::io::SeekFrom::Start(old_position))?;
        }

        Ok(())
    }

    pub async fn parse<R: DataReader>(
        data: &DataSource<R>,
        config: PackageConfig,
        options: ParseOptions,
    ) -> Result<Self> {
        let key_header = KeyHeader::parse(data).await?;

        let headers_end_offset = key_header.headers_end_offset;

        if headers_end_offset < 4 {
            eyre::bail!("Invalid headers_end_offset: {}", headers_end_offset);
        }

        if headers_end_offset > data.size() {
            eyre::bail!(
                "Header offset ({}) exceeds data size ({}), \
                 the archive may be split across multiple files - \
                 try providing the .pkx/.pkx1/.pkx2/... files as well",
                headers_end_offset,
                data.size(),
            );
        }

        let raw_version = data
            .get(headers_end_offset - 4..headers_end_offset)?
            .as_le::<u32>()
            .await?;
        let version = PckVersion::from_raw(raw_version)?;

        let package_header_size = PackageHeader::size_for_version(version) as u64;

        if headers_end_offset < PackageMetaHeader::SIZE as u64 + package_header_size {
            eyre::bail!(
                "Invalid headers_end_offset: {} (minimum is {})",
                headers_end_offset,
                PackageMetaHeader::SIZE as u64 + package_header_size
            );
        }

        let meta_header_offset = headers_end_offset - PackageMetaHeader::SIZE as u64;
        let header_offset = meta_header_offset - package_header_size;

        let meta_header = PackageMetaHeader::parse(
            &data
                .get_at(meta_header_offset, PackageMetaHeader::SIZE as u64)
                .wrap_err_with(|| eyre!("Invalid meta-header position"))?,
        )
        .await?;

        let package_header =
            PackageHeader::parse(&data.get_at(header_offset, package_header_size)?, version)
                .await?;

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

        let entry_offset = package_header.entry_offset ^ version.entry_offset_key(config.key1);
        let mut offset = entry_offset;

        let min_entry_size = FileGbkEntry::min_parse_size(version);
        let file_count = meta_header.file_count as usize;
        let mut on_progress = options.on_progress.map(|mut cb| {
            let mut throttle = Throttle::new(options.progress_interval_ms);
            move |index: usize| -> Result<()> {
                if index + 1 == file_count || throttle.allow() {
                    cb(ParseProgress {
                        index,
                        total: file_count,
                    })?;
                }
                Ok(())
            }
        });

        let mut files = Vec::with_capacity(meta_header.file_count as usize);
        for i in 0..meta_header.file_count {
            if let Some(ref mut on_progress) = on_progress {
                on_progress(i as usize)?;
            }
            let first_size = data.get_at(offset, 4)?.as_le::<u32>().await? ^ config.key1;
            offset += 4;

            let second_size =
                data.get_at(offset, 4)?.as_le::<u32>().await? ^ config.key1 ^ config.key2;
            offset += 4;

            if first_size != second_size {
                eyre::bail!(
                    "Invalid decoded compressed size: {0:08X} != {1:08X}",
                    first_size,
                    second_size
                );
            }

            let size = first_size as u64;
            let entry_data = data.get_at(offset, size)?;
            let entry_bytes = entry_data.to_bytes().await?;
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

            let gbk_entry =
                FileGbkEntry::parse(&DataSource::from_bytes(decoded_entry), version).await?;
            let decoded_entry: FileEntry = gbk_entry.try_into()?;
            files.push(decoded_entry);
        }

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

    /// Scan file entries and deliver results in chunks via a callback.
    ///
    /// When `paths` is `None`, all files are scanned. When `Some`, only the
    /// listed paths are looked up (unknown paths are silently skipped).
    /// The callback receives chunks of [`FileEntrySummary`] at roughly
    /// `options.interval_ms` intervals; any remaining entries are flushed
    /// at the end. Returning an `Err` from the callback stops iteration.
    pub async fn scan_entries<'a, R: DataReader>(
        &'a self,
        content: &DataSource<R>,
        paths: &[&str],
        mut options: ScanEntriesOptions<'a>,
    ) -> Result<()> {
        let entries: Vec<&FileEntry> = paths
            .iter()
            .filter_map(|p| {
                let normalized = FileEntry::normalize_path(p);
                self.files
                    .binary_search_by(|e| e.normalized_name.cmp(&normalized))
                    .ok()
                    .map(|idx| &self.files[idx])
            })
            .collect();

        let mut throttle = Throttle::new(options.interval_ms);
        let mut chunk: Vec<FileEntrySummary<'_>> = Vec::new();

        for entry in &entries {
            let hash: u32 = content
                .read_at(entry.offset, entry.compressed_size as usize, |b| {
                    crc32fast::hash(b)
                })
                .await
                .unwrap_or(0);

            chunk.push(FileEntrySummary {
                path: &entry.normalized_name,
                size: entry.size,
                compressed_size: entry.compressed_size,
                hash,
            });

            if throttle.allow() {
                (options.on_chunk)(&chunk)?;
                chunk.clear();
            }
        }

        if !chunk.is_empty() {
            (options.on_chunk)(&chunk)?;
        }

        Ok(())
    }

    pub async fn get_file<R: DataReader>(
        &self,
        content: &DataSource<R>,
        path: &str,
    ) -> Option<Vec<u8>> {
        let path = FileEntry::normalize_path(path);

        let entry = self
            .files
            .binary_search_by(|e| e.normalized_name.cmp(&path))
            .ok()
            .map(|index| &self.files[index])?;

        entry.get_file(content).await
    }
}

pub(crate) fn compress_package_entry(data: &[u8], level: i32) -> Vec<u8> {
    miniz_oxide::deflate::compress_to_vec_zlib(data, level as u8)
}

fn decompress_package_entry(
    compressed: &[u8],
) -> Result<Vec<u8>, miniz_oxide::inflate::DecompressError> {
    miniz_oxide::inflate::decompress_to_vec_zlib(compressed)
}

pub(crate) fn encode_gbk_filename(name: &str) -> Result<Vec<u8>> {
    use encoding::*;
    all::GBK
        .encode(name, EncoderTrap::Strict)
        .map_err(|s| eyre!("GBK encoding error: {s}"))
}

pub(crate) fn pad_filename(bytes: &[u8]) -> Result<[u8; 260]> {
    if bytes.len() > 259 {
        eyre::bail!("Filename too long ({} > 259)", bytes.len());
    }
    let mut result = [0u8; 260];
    result[..bytes.len()].copy_from_slice(bytes);
    Ok(result)
}

pub(crate) fn write_entry_table<W: Write>(
    entries: &[FileGbkEntry],
    version: PckVersion,
    config: &PackageConfig,
    writer: &mut W,
) -> Result<()> {
    let entry_save_size = FileGbkEntry::save_size(version);
    let mut entry_buf = vec![0u8; entry_save_size];

    for entry in entries {
        {
            let mut cursor = &mut entry_buf[..];
            entry.save(&mut cursor, version)?;
        }

        let compressed_entry = compress_package_entry(&entry_buf, 3);
        let compressed_size = compressed_entry.len() as u32;

        writer.write_all(&(compressed_size ^ config.key1).to_le_bytes())?;
        writer.write_all(&(compressed_size ^ config.key1 ^ config.key2).to_le_bytes())?;
        writer.write_all(&compressed_entry)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::include_test_data_bytes;

    fn ds(bytes: &[u8]) -> DataSource<Vec<u8>> {
        DataSource::from_bytes(bytes.to_vec())
    }

    #[test]
    fn parse_key_header() {
        assert!(pollster::block_on(KeyHeader::parse(&ds(b""))).is_err());
        assert!(pollster::block_on(KeyHeader::parse(&ds(b"\x00\x00\x00\x00"))).is_err());

        // 12-byte (narrow) format: key1=1, offset=16, key2=3, then version 0x20002 at bytes 12..16
        let mut narrow = vec![0u8; 16];
        narrow[0..4].copy_from_slice(&1u32.to_le_bytes()); // key1
        narrow[4..8].copy_from_slice(&16u32.to_le_bytes()); // offset → points to end
        narrow[8..12].copy_from_slice(&3u32.to_le_bytes()); // key2
        narrow[12..16].copy_from_slice(&0x20002u32.to_le_bytes()); // version tag
        assert_eq!(
            pollster::block_on(KeyHeader::parse(&ds(&narrow))).unwrap(),
            KeyHeader {
                key1: 1,
                headers_end_offset: 16,
                key2: 3,
                wide: false,
            }
        );

        // Wide (u64 offset) format cannot be unit-tested with small buffers because
        // the narrow parser always matches first when the upper 32 bits are zero.
        // The wide path is exercised by real >4GB multi-part archives.
    }

    #[test]
    fn parse_package_header() {
        assert!(pollster::block_on(PackageHeader::parse(&ds(b""), PckVersion::V2)).is_err());
        assert!(pollster::block_on(PackageHeader::parse(&ds(b"123"), PckVersion::V2)).is_err());
        assert_eq!(
            pollster::block_on(PackageHeader::parse(
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
            ))
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
        let package = pollster::block_on(PackageInfo::parse(
            &ds(bytes),
            Default::default(),
            Default::default(),
        ))
        .unwrap();

        assert!(!package.files.is_empty());
    }

    #[test]
    fn find_prefix_empty_returns_all() {
        let bytes = include_test_data_bytes!("packages/configs.pck");
        let package = pollster::block_on(PackageInfo::parse(
            &ds(bytes),
            Default::default(),
            Default::default(),
        ))
        .unwrap();

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
        assert!(
            pollster::block_on(PackageInfo::parse(
                &ds(b""),
                config.clone(),
                Default::default()
            ))
            .is_err()
        );
        assert!(
            pollster::block_on(PackageInfo::parse(
                &ds(b"short"),
                config.clone(),
                Default::default()
            ))
            .is_err()
        );
        assert!(
            pollster::block_on(PackageInfo::parse(
                &ds(&[0u8; 11]),
                config,
                Default::default()
            ))
            .is_err()
        );
    }

    #[test]
    fn parse_invalid_headers_end_offset() {
        let mut data = vec![0u8; 512];
        // headers_end_offset = 100, which is less than PackageHeader::SIZE_V2 + PackageMetaHeader::SIZE_V2 = 280
        data[4..8].copy_from_slice(&100u32.to_le_bytes());
        // Set a valid version at offset 96..100 so the version check passes
        data[96..100].copy_from_slice(&0x20002u32.to_le_bytes());
        let config: PackageConfig = Default::default();
        let err = pollster::block_on(PackageInfo::parse(
            &DataSource::from_bytes(data),
            config,
            Default::default(),
        ))
        .unwrap_err();
        assert!(
            err.to_string().contains("Invalid headers_end_offset"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn parse_missing_pkx_split_archive() {
        // Simulate a split archive where only the .pck part is present:
        // truncate a real pck before its headers_end_offset so the stored
        // offset now lands past end of data. The error should hint at the
        // missing .pkx companions, not a generic "unknown version".
        let full = configs_pck_bytes();
        let heo = headers_end_offset(&full);
        let truncated = full[..heo - 16].to_vec();
        let config: PackageConfig = Default::default();
        let err = pollster::block_on(PackageInfo::parse(
            &DataSource::from_bytes(truncated),
            config,
            Default::default(),
        ))
        .unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("past end of data"), "unexpected error: {err}");
        assert!(msg.contains(".pkx"), "missing split-archive hint: {err}");
    }

    #[test]
    fn parse_unknown_version() {
        let mut data = configs_pck_bytes();
        let heo = headers_end_offset(&data);
        // version is at heo - 4 (last 4 bytes of PackageMetaHeader)
        let version_offset = heo - 4;
        data[version_offset..version_offset + 4].copy_from_slice(&0x99999u32.to_le_bytes());
        let config: PackageConfig = Default::default();
        // Corrupted version causes KeyHeader::parse to fail (neither narrow nor wide yields valid version)
        let err = pollster::block_on(PackageInfo::parse(
            &DataSource::from_bytes(data),
            config,
            Default::default(),
        ))
        .unwrap_err();
        assert!(
            err.to_string().contains("key header"),
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
        let err = pollster::block_on(PackageInfo::parse(
            &DataSource::from_bytes(data),
            config,
            Default::default(),
        ))
        .unwrap_err();
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
        let err = pollster::block_on(PackageInfo::parse(&ds(&data), config, Default::default()))
            .unwrap_err();
        assert!(
            err.to_string().contains("Invalid guard1"),
            "unexpected error: {err}"
        );

        let config = PackageConfig {
            guard2: 0xDEADBEEF,
            ..Default::default()
        };
        let err = pollster::block_on(PackageInfo::parse(&ds(&data), config, Default::default()))
            .unwrap_err();
        assert!(
            err.to_string().contains("Invalid guard2"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn scan_entries_basic() {
        let bytes = include_test_data_bytes!("packages/configs.pck");
        let content = ds(bytes);
        let package = pollster::block_on(PackageInfo::parse(
            &content,
            Default::default(),
            Default::default(),
        ))
        .unwrap();

        let total_count = std::rc::Rc::new(std::cell::Cell::new(0usize));
        let cb_count = total_count.clone();
        let options = ScanEntriesOptions {
            on_chunk: Box::new(move |chunk| {
                cb_count.set(cb_count.get() + chunk.len());
                Ok(())
            }),
            interval_ms: 0,
        };

        let all_paths: Vec<&str> = package
            .find_prefix("")
            .iter()
            .map(|e| e.normalized_name.as_str())
            .collect();
        pollster::block_on(package.scan_entries(&content, &all_paths, options)).unwrap();
        assert_eq!(total_count.get(), package.file_count());
    }

    #[test]
    fn scan_entries_chunks() {
        let bytes = include_test_data_bytes!("packages/configs.pck");
        let content = ds(bytes);
        let package = pollster::block_on(PackageInfo::parse(
            &content,
            Default::default(),
            Default::default(),
        ))
        .unwrap();

        let collected = std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
        let cb_collected = collected.clone();
        let options = ScanEntriesOptions {
            on_chunk: Box::new(move |chunk| {
                for entry in chunk {
                    cb_collected.borrow_mut().push((
                        entry.path.to_owned(),
                        entry.size,
                        entry.compressed_size,
                        entry.hash,
                    ));
                }
                Ok(())
            }),
            interval_ms: 0,
        };

        let all_paths: Vec<&str> = package
            .find_prefix("")
            .iter()
            .map(|e| e.normalized_name.as_str())
            .collect();
        pollster::block_on(package.scan_entries(&content, &all_paths, options)).unwrap();
        let collected = collected.borrow();
        assert_eq!(collected.len(), package.file_count());
        for (path, _size, _compressed_size, _hash) in collected.iter() {
            assert!(!path.is_empty());
        }
    }

    #[test]
    fn scan_entries_cancellation() {
        let bytes = include_test_data_bytes!("packages/configs.pck");
        let content = ds(bytes);
        let package = pollster::block_on(PackageInfo::parse(
            &content,
            Default::default(),
            Default::default(),
        ))
        .unwrap();

        let chunk_count = std::rc::Rc::new(std::cell::Cell::new(0usize));
        let cb_count = chunk_count.clone();
        let options = ScanEntriesOptions {
            on_chunk: Box::new(move |_chunk| {
                let n = cb_count.get() + 1;
                cb_count.set(n);
                if n >= 2 {
                    eyre::bail!("cancelled");
                }
                Ok(())
            }),
            // Use 0 interval so every entry triggers a flush — this ensures
            // the callback is invoked per entry so we can cancel on the 2nd.
            interval_ms: 0,
        };

        let all_paths: Vec<&str> = package
            .find_prefix("")
            .iter()
            .map(|e| e.normalized_name.as_str())
            .collect();
        let result = pollster::block_on(package.scan_entries(&content, &all_paths, options));
        assert!(result.is_err());
        assert_eq!(chunk_count.get(), 2);
        assert!(result.unwrap_err().to_string().contains("cancelled"));
    }

    #[test]
    fn scan_entries_with_paths() {
        let bytes = include_test_data_bytes!("packages/configs.pck");
        let content = ds(bytes);
        let package = pollster::block_on(PackageInfo::parse(
            &content,
            Default::default(),
            Default::default(),
        ))
        .unwrap();

        // Pick two known paths from the package and one that doesn't exist.
        let all_files = package.find_prefix("");
        assert!(
            all_files.len() >= 2,
            "need at least 2 files in test package"
        );
        let existing1 = &all_files[0].normalized_name;
        let existing2 = &all_files[1].normalized_name;
        let paths = [
            existing1.as_str(),
            existing2.as_str(),
            "nonexistent\\file.txt",
        ];

        let collected = std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
        let cb_collected = collected.clone();
        let options = ScanEntriesOptions {
            on_chunk: Box::new(move |chunk| {
                for entry in chunk {
                    cb_collected.borrow_mut().push(entry.path.to_owned());
                }
                Ok(())
            }),
            interval_ms: 0,
        };

        pollster::block_on(package.scan_entries(&content, &paths, options)).unwrap();
        let collected = collected.borrow();
        assert_eq!(collected.len(), 2);
        assert!(collected.contains(existing1));
        assert!(collected.contains(existing2));
    }

    #[test]
    fn parse_progress_callback_values() {
        let bytes = include_test_data_bytes!("packages/configs.pck");

        let collected = std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
        let cb_collected = collected.clone();

        let options = ParseOptions {
            on_progress: Some(Box::new(move |p: ParseProgress| {
                cb_collected.borrow_mut().push((p.index, p.total));
                Ok(())
            })),
            ..Default::default()
        };

        let package =
            pollster::block_on(PackageInfo::parse(&ds(bytes), Default::default(), options))
                .unwrap();
        let collected = collected.borrow();
        let total = package.file_count();
        assert_eq!(collected.len(), total);
        for (i, (index, cb_total)) in collected.iter().enumerate() {
            assert_eq!(*index, i);
            assert_eq!(*cb_total, total);
        }
    }

    #[test]
    fn parse_progress_cancellation() {
        let bytes = include_test_data_bytes!("packages/configs.pck");

        let call_count = std::rc::Rc::new(std::cell::Cell::new(0usize));
        let cb_count = call_count.clone();
        let options = ParseOptions {
            on_progress: Some(Box::new(move |_: ParseProgress| {
                let n = cb_count.get() + 1;
                cb_count.set(n);
                if n >= 2 {
                    eyre::bail!("cancelled");
                }
                Ok(())
            })),
            ..Default::default()
        };

        let result =
            pollster::block_on(PackageInfo::parse(&ds(bytes), Default::default(), options));
        assert!(result.is_err());
        assert_eq!(call_count.get(), 2);
        assert!(result.unwrap_err().to_string().contains("cancelled"));
    }
}
