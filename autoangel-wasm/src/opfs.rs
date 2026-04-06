use autoangel_core::util::data_source::{DataReader, DataSource};
use eyre::{Result, eyre};
use std::sync::Arc;
use web_sys::FileSystemSyncAccessHandle;

/// Wrapper to make `FileSystemSyncAccessHandle` implement `Send + Sync`.
///
/// This is safe because WASM is single-threaded (without `SharedArrayBuffer`
/// and atomics). The handle is only accessed from the Web Worker thread
/// that created it.
struct SyncHandle(FileSystemSyncAccessHandle);

// SAFETY: WASM is single-threaded; the handle never crosses threads.
unsafe impl Send for SyncHandle {}
unsafe impl Sync for SyncHandle {}

/// DataReader backed by an OPFS `FileSystemSyncAccessHandle`.
///
/// Reads are synchronous and only available in dedicated Web Workers.
/// Each `read_at` call invokes the handle's `read` method at the given
/// offset, reading only the requested bytes — no full-file load required.
pub struct OpfsReader {
    handle: SyncHandle,
    size: u64,
}

impl OpfsReader {
    pub fn new(handle: FileSystemSyncAccessHandle) -> Result<Self> {
        let size = handle
            .get_size()
            .map_err(|e| eyre!("getSize failed: {e:?}"))? as u64;
        Ok(Self {
            handle: SyncHandle(handle),
            size,
        })
    }
}

impl DataReader for OpfsReader {
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> Result<()> {
        let end = offset + buf.len() as u64;
        if end > self.size {
            return Err(eyre!(
                "OpfsReader: read out of bounds: {}..{} (size {})",
                offset,
                end,
                self.size,
            ));
        }

        let opts = web_sys::FileSystemReadWriteOptions::new();
        opts.set_at(offset as f64);

        let bytes_read = self
            .handle
            .0
            .read_with_u8_array_and_options(buf, &opts)
            .map_err(|e| eyre!("OPFS read failed: {e:?}"))? as usize;

        if bytes_read != buf.len() {
            return Err(eyre!(
                "OpfsReader: short read at offset {}: got {} bytes, expected {}",
                offset,
                bytes_read,
                buf.len(),
            ));
        }

        Ok(())
    }

    fn size(&self) -> u64 {
        self.size
    }
}

/// Create a `DataSource` from one or more OPFS handles (pck + pkx + pkx1 + ...).
pub fn data_source_from_handles(handles: Vec<FileSystemSyncAccessHandle>) -> Result<DataSource> {
    let readers: Vec<Arc<dyn DataReader>> = handles
        .into_iter()
        .map(|h| -> Result<Arc<dyn DataReader>> { Ok(Arc::new(OpfsReader::new(h)?)) })
        .collect::<Result<_>>()?;
    Ok(DataSource::composite(readers))
}
