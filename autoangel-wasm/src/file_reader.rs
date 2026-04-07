use autoangel_core::util::data_source::{DataReader, DataSource, MultiReader};
use eyre::{Result, eyre};
use std::cell::RefCell;
use std::sync::Arc;
use wasm_bindgen_futures::JsFuture;

/// Wrapper to make `web_sys::File` Send+Sync (WASM is single-threaded).
struct JsFile(web_sys::File);
unsafe impl Send for JsFile {}
unsafe impl Sync for JsFile {}

const DEFAULT_CHUNK_SIZE: usize = 4 * 1024 * 1024; // 4MB

struct BufferState {
    data: Vec<u8>,
    offset: u64,
    len: usize,
}

pub struct BufferedFileReader {
    file: JsFile,
    size: u64,
    chunk_size: usize,
    buffer: RefCell<BufferState>,
}

// SAFETY: WASM is single-threaded
unsafe impl Send for BufferedFileReader {}
unsafe impl Sync for BufferedFileReader {}

impl BufferedFileReader {
    pub fn new(file: web_sys::File) -> Self {
        let size = file.size() as u64;
        Self {
            file: JsFile(file),
            size,
            chunk_size: DEFAULT_CHUNK_SIZE,
            buffer: RefCell::new(BufferState {
                data: Vec::new(),
                offset: 0,
                len: 0,
            }),
        }
    }

    async fn fetch_chunk(&self, offset: u64, min_len: usize) -> Result<()> {
        let chunk_size = self.chunk_size.max(min_len) as u64;
        let end = (offset + chunk_size).min(self.size);
        let start = offset as f64;

        // File inherits from Blob, use Blob::slice
        let blob: &web_sys::Blob = self.file.0.as_ref();
        let sliced = blob
            .slice_with_f64_and_f64(start, end as f64)
            .map_err(|e| eyre!("Blob.slice failed: {e:?}"))?;
        let promise = sliced.array_buffer();
        let array_buffer = JsFuture::from(promise)
            .await
            .map_err(|e| eyre!("arrayBuffer() failed: {e:?}"))?;
        let uint8 = js_sys::Uint8Array::new(&array_buffer);
        let len = uint8.length() as usize;

        let mut buf = self.buffer.borrow_mut();
        buf.data.resize(len, 0);
        uint8.copy_to(&mut buf.data[..len]);
        buf.offset = offset;
        buf.len = len;
        Ok(())
    }
}

impl DataReader for BufferedFileReader {
    async fn read_at<F, T>(&self, offset: u64, len: usize, f: F) -> Result<T>
    where
        F: FnOnce(&[u8]) -> T,
    {
        let end = offset + len as u64;
        if end > self.size {
            return Err(eyre!(
                "BufferedFileReader: read out of bounds: {}..{} (size {})",
                offset,
                end,
                self.size,
            ));
        }

        // Check buffer hit
        {
            let state = self.buffer.borrow();
            let buf_end = state.offset + state.len as u64;
            if offset >= state.offset && end <= buf_end {
                let local = (offset - state.offset) as usize;
                return Ok(f(&state.data[local..local + len]));
            }
        }

        // Cache miss — fetch new chunk
        self.fetch_chunk(offset, len).await?;

        let state = self.buffer.borrow();
        let local = (offset - state.offset) as usize;
        Ok(f(&state.data[local..local + len]))
    }

    fn size(&self) -> u64 {
        self.size
    }
}

/// Create a DataSource from one or more JS File objects (pck + pkx + ...).
pub fn data_source_from_files(
    files: Vec<web_sys::File>,
) -> DataSource<MultiReader<BufferedFileReader>> {
    let readers: Vec<Arc<BufferedFileReader>> = files
        .into_iter()
        .map(|f| Arc::new(BufferedFileReader::new(f)))
        .collect();
    DataSource::composite(readers)
}
