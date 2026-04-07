pub mod elements;
pub mod file_reader;
pub mod image;
pub mod pck;

use wasm_bindgen::JsError;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Format an eyre error chain as newline-separated lines (one per cause).
fn format_error(e: &eyre::Report) -> JsError {
    let msg: String = e
        .chain()
        .map(|c| c.to_string())
        .collect::<Vec<_>>()
        .join("\n");
    JsError::new(&msg)
}
