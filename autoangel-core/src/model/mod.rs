pub mod bmd;
pub mod bon;
pub(crate) mod common;
pub mod ecm;
pub mod gfx;
pub mod ski;
pub mod smd;
pub mod stck;
pub(crate) mod text_reader;

/// Conditional derive bundle applied via `#[apply(bindable)]` to every
/// data type that crosses the Rust ↔ Python / TypeScript boundary.
macro_rules! bindable {
    ($($item:tt)*) => {
        #[cfg_attr(
            feature = "python",
            ::pyo3::pyclass(get_all, frozen, module = "autoangel", from_py_object)
        )]
        #[cfg_attr(feature = "wasm", derive(::tsify_next::Tsify))]
        #[cfg_attr(feature = "wasm", tsify(into_wasm_abi))]
        #[derive(Debug, Clone, ::serde::Serialize)]
        $($item)*
    };
}
pub(crate) use bindable;
