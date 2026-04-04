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
    size: usize,
}

impl OpfsReader {
    pub fn new(handle: FileSystemSyncAccessHandle) -> Result<Self> {
        let size = handle
            .get_size()
            .map_err(|e| eyre!("getSize failed: {e:?}"))? as usize;
        Ok(Self {
            handle: SyncHandle(handle),
            size,
        })
    }
}

impl DataReader for OpfsReader {
    fn read_at(&self, offset: usize, buf: &mut [u8]) -> Result<()> {
        let end = offset + buf.len();
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

    fn size(&self) -> usize {
        self.size
    }
}

/// Create a `DataSource` from a single OPFS sync access handle.
pub fn data_source_from_handle(handle: FileSystemSyncAccessHandle) -> Result<DataSource> {
    let reader: Arc<dyn DataReader> = Arc::new(OpfsReader::new(handle)?);
    Ok(DataSource::from_reader(reader))
}

/// Create a `DataSource` from two OPFS handles (pck + pkx).
pub fn data_source_from_handles(
    handle1: FileSystemSyncAccessHandle,
    handle2: FileSystemSyncAccessHandle,
) -> Result<DataSource> {
    let reader1: Arc<dyn DataReader> = Arc::new(OpfsReader::new(handle1)?);
    let reader2: Arc<dyn DataReader> = Arc::new(OpfsReader::new(handle2)?);
    Ok(DataSource::composite(reader1, reader2))
}
