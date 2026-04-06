use dds::{ColorFormat, Decoder, ImageViewMut};
use image::ImageFormat;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

/// Decoded image: RGBA8 pixels + dimensions.
#[wasm_bindgen]
pub struct DecodedImage {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

#[wasm_bindgen]
impl DecodedImage {
    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    /// Consume the struct and return the RGBA pixel buffer (avoids a copy).
    #[wasm_bindgen(js_name = "intoRgba")]
    pub fn into_rgba(self) -> Vec<u8> {
        self.rgba
    }
}

/// Decode a DDS file to RGBA8 pixels.
#[wasm_bindgen(js_name = "decodeDds")]
pub fn decode_dds(bytes: &[u8]) -> Result<DecodedImage, JsError> {
    let mut decoder =
        Decoder::new(Cursor::new(bytes)).map_err(|e| JsError::new(&format!("{e}")))?;

    let size = decoder.main_size();
    let width = size.width;
    let height = size.height;

    let pixel_count = width as usize * height as usize;
    let mut rgba = vec![0u8; pixel_count * 4];

    let view = ImageViewMut::new(&mut rgba, size, ColorFormat::RGBA_U8)
        .ok_or_else(|| JsError::new("Failed to create image view for DDS decode"))?;

    decoder
        .read_surface(view)
        .map_err(|e| JsError::new(&format!("{e}")))?;

    Ok(DecodedImage {
        width,
        height,
        rgba,
    })
}

/// Decode a TGA file to RGBA8 pixels.
#[wasm_bindgen(js_name = "decodeTga")]
pub fn decode_tga(bytes: &[u8]) -> Result<DecodedImage, JsError> {
    let img = image::load_from_memory_with_format(bytes, ImageFormat::Tga)
        .map_err(|e| JsError::new(&format!("{e}")))?;

    let rgba_img = img.into_rgba8();
    let width = rgba_img.width();
    let height = rgba_img.height();
    let rgba = rgba_img.into_raw();

    Ok(DecodedImage {
        width,
        height,
        rgba,
    })
}
