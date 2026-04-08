// parking_lot RwLock guards held across .await are safe here:
// - Native/Python: in-memory DataReader futures resolve immediately (single poll)
// - WASM: single-threaded, no contention
#![allow(clippy::await_holding_lock)]

pub mod elements;
pub mod model;
pub mod pck;
pub mod util;
