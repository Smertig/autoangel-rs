use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Seek, Write};
use std::sync::Arc;

#[cfg(feature = "fs")]
use std::path::Path;

use eyre::{Result, eyre};

use crate::util::data_source::DataReader;

use super::package::{
    FileEntry, FileGbkEntry, KeyHeader, PackageConfig, PackageHeader, PackageMetaHeader,
    PackageSource, PckVersion, compress_package_entry, encode_gbk_filename, pad_filename,
    write_entry_table,
};

pub struct PackageBuilder<R: DataReader> {
    source: Option<Arc<PackageSource<R>>>,
    /// normalized_name -> (original_name, content)
    added: HashMap<String, (String, Vec<u8>)>,
    /// normalized names
    removed: HashSet<String>,
}

impl<R: DataReader> PackageBuilder<R> {
    /// Create an empty builder (from scratch).
    pub fn new() -> Self {
        PackageBuilder {
            source: None,
            added: HashMap::new(),
            removed: HashSet::new(),
        }
    }

    /// Create a builder pre-populated with an existing package's files (lazy reference).
    pub fn from_package(source: Arc<PackageSource<R>>) -> Self {
        PackageBuilder {
            source: Some(source),
            added: HashMap::new(),
            removed: HashSet::new(),
        }
    }

    /// Add or overwrite a file. Normalizes path via `FileEntry::normalize_path`.
    pub fn add_file(&mut self, path: &str, data: Vec<u8>) {
        let normalized = FileEntry::normalize_path(path);
        self.removed.remove(&normalized);
        self.added.insert(normalized, (path.to_string(), data));
    }

    /// Remove a file. Returns true if file was present (in added or in source and not already
    /// removed), false otherwise.
    pub fn remove_file(&mut self, path: &str) -> bool {
        let normalized = FileEntry::normalize_path(path);

        if self.added.remove(&normalized).is_some() {
            return true;
        }

        if let Some(ref source) = self.source {
            let in_source = source
                .info
                .files
                .binary_search_by(|e| e.normalized_name.cmp(&normalized))
                .is_ok();

            if in_source && !self.removed.contains(&normalized) {
                self.removed.insert(normalized);
                return true;
            }
        }

        false
    }

    /// Return the final file set: (source files - removed - overwritten by added) + added, sorted.
    pub fn file_list(&self) -> Vec<&str> {
        let mut names: Vec<&str> = Vec::new();

        if let Some(ref source) = self.source {
            for entry in &source.info.files {
                if !self.removed.contains(&entry.normalized_name)
                    && !self.added.contains_key(&entry.normalized_name)
                {
                    names.push(&entry.normalized_name);
                }
            }
        }

        for normalized in self.added.keys() {
            names.push(normalized.as_str());
        }

        names.sort();
        names
    }

    /// Number of files in the final set.
    pub fn file_count(&self) -> usize {
        let source_count = self.source.as_ref().map_or(0, |s| {
            s.info
                .files
                .iter()
                .filter(|e| {
                    !self.removed.contains(&e.normalized_name)
                        && !self.added.contains_key(&e.normalized_name)
                })
                .count()
        });
        source_count + self.added.len()
    }

    /// Return source version if available, else 0x20002.
    pub fn default_version(&self) -> u32 {
        self.source
            .as_ref()
            .map(|s| s.info.meta_header.version)
            .unwrap_or(0x20002)
    }

    fn default_description() -> [u8; 252] {
        let mut desc = [0u8; 252];
        let msg = b"Angelica File Package";
        desc[..msg.len()].copy_from_slice(msg);
        desc
    }

    fn find_source_entry<'a>(source: &'a PackageSource<R>, name: &str) -> Option<&'a FileEntry> {
        source
            .info
            .files
            .binary_search_by(|e| e.normalized_name.as_str().cmp(name))
            .ok()
            .map(|idx| &source.info.files[idx])
    }

    /// Serialize the package to a writer.
    pub async fn save_to<W: Write + Seek>(
        &self,
        writer: &mut W,
        version: u32,
        config: &PackageConfig,
    ) -> Result<()> {
        let pck_version = PckVersion::from_raw(version)?;
        let wide = pck_version == PckVersion::V3;

        let key_header_template = KeyHeader {
            wide,
            ..Default::default()
        };
        key_header_template.save(writer)?;
        let mut current_offset: u64 = key_header_template.size() as u64;

        let file_list = self.file_list();
        let mut new_entries: Vec<FileGbkEntry> = Vec::with_capacity(file_list.len());

        for normalized_name in &file_list {
            if let Some((original_name, data)) = self.added.get(*normalized_name) {
                let compressed = compress_package_entry(data, 3);
                let (stored, compressed_size, uncompressed_size) = if compressed.len() >= data.len()
                {
                    (data.as_slice(), data.len() as u32, data.len() as u32)
                } else {
                    (
                        compressed.as_slice(),
                        compressed.len() as u32,
                        data.len() as u32,
                    )
                };

                writer.write_all(stored)?;

                new_entries.push(FileGbkEntry {
                    filename: pad_filename(&encode_gbk_filename(original_name)?)?,
                    offset: current_offset,
                    size: uncompressed_size,
                    compressed_size,
                });

                current_offset += stored.len() as u64;
            } else {
                let source = self
                    .source
                    .as_ref()
                    .expect("file in list but not in added implies source exists");
                let entry = Self::find_source_entry(source, normalized_name)
                    .ok_or_else(|| eyre!("Source entry not found: {}", normalized_name))?;

                source
                    .content
                    .read_at(entry.offset, entry.compressed_size as usize, |b| {
                        writer.write_all(b)
                    })
                    .await??;

                new_entries.push(FileGbkEntry {
                    filename: pad_filename(&encode_gbk_filename(&entry.original_name)?)?,
                    offset: current_offset,
                    size: entry.size,
                    compressed_size: entry.compressed_size,
                });

                current_offset += entry.compressed_size as u64;
            }
        }

        let entry_table_offset = current_offset;
        write_entry_table(&new_entries, pck_version, config, writer)?;

        let (description, flags) = if let Some(ref src) = self.source {
            (
                src.info.package_header.description,
                src.info.package_header.flags,
            )
        } else {
            (Self::default_description(), 0u32)
        };

        let entry_offset = entry_table_offset ^ pck_version.entry_offset_key(config.key1);
        let package_header = PackageHeader {
            guard1: config.guard1,
            version,
            entry_offset,
            flags,
            description,
            guard2: config.guard2,
        };

        let meta_header = PackageMetaHeader {
            version,
            file_count: new_entries.len() as u32,
        };

        package_header.save(writer, pck_version)?;
        meta_header.save(writer)?;

        let end_offset = writer.stream_position()?;

        let (key1, key2) = if let Some(ref src) = self.source {
            (src.info.key_header.key1, src.info.key_header.key2)
        } else {
            (config.key1, config.key2)
        };

        let key_header = KeyHeader {
            key1,
            headers_end_offset: end_offset,
            key2,
            wide,
        };

        let old_position = writer.stream_position()?;
        writer.seek(std::io::SeekFrom::Start(0))?;
        key_header.save(writer)?;
        writer.seek(std::io::SeekFrom::Start(old_position))?;

        Ok(())
    }

    /// Serialize the package to a `Vec<u8>`.
    pub async fn to_bytes(&self, version: u32, config: &PackageConfig) -> Result<Vec<u8>> {
        let mut cursor = Cursor::new(Vec::new());
        self.save_to(&mut cursor, version, config).await?;
        Ok(cursor.into_inner())
    }

    /// Save the package to a file.
    #[cfg(feature = "fs")]
    pub async fn save<P: AsRef<Path>>(
        &self,
        path: P,
        version: u32,
        config: &PackageConfig,
    ) -> Result<()> {
        let mut file = std::fs::File::create(path)?;
        self.save_to(&mut file, version, config).await
    }
}

impl<R: DataReader> Default for PackageBuilder<R> {
    fn default() -> Self {
        Self::new()
    }
}
