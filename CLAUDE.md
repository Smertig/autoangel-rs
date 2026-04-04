# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
cargo build                       # debug build
cargo build --release             # release build (LTO enabled)

cargo test -p autoangel-core           # Rust tests
cd autoangel-py && uv run pytest       # Python tests (auto-rebuilds extension if .rs files changed)

cargo fmt --all -- --check             # check formatting
cargo clippy --all-features            # lint
```

Requires [uv](https://docs.astral.sh/uv/). Test data in `tests/test_data/` uses Git LFS — fetch with `git lfs pull` if tests fail on missing data.

### Python Wheel Build

Uses **maturin** as PEP 517 build backend (`autoangel-py/pyproject.toml`). CI uses `PyO3/maturin-action` for cross-platform wheel builds. `uv run` triggers maturin builds automatically via cache-keys for `.rs` file changes.

### Benchmarks

Run from the `autoangel-core/` directory using criterion:

```bash
cd autoangel-core && cargo bench                  # all benchmarks
cd autoangel-core && cargo bench --bench elements  # elements only
cd autoangel-core && cargo bench --bench pck       # pck only
```

### Documentation

```bash
uv run docs/rebuild.py  # rebuild HTML docs
```

## Architecture

Cargo workspace with two crates:

### autoangel-core
Core Rust library for parsing Angelica Engine game files:
- **`elements/`** — parsing and manipulation of `elements.data` files (config structures, typed field values, game-specific dialect definitions bundled via `include_dir`)
- **`pck/`** — reading `*.pck`/`*.pkx` compressed game asset packages (keyed encryption, zlib decompression via `miniz_oxide`)
- **`util/`** — `DataSource`/`DataReader` for backend-agnostic byte access (supports mmap, OPFS), `LineReader` for config parsing

Key patterns: `memmap::Mmap` for zero-copy file I/O, `Arc<T>` shared ownership of parsed data, `parking_lot::RwLock` for mutable entry fields.

### autoangel-py
PyO3 bindings exposing `autoangel-core` as the `autoangel` Python module. Uses `abi3-py37` for broad Python version compatibility. Python tests use pytest (in `autoangel-py/tests/`), not `cargo test`.

- **`elements/`** — `py_config`, `py_data`, `py_value`, `py_util` wrapping core elements types
- **`pck/`** — `py_package`, `py_package_config` wrapping core pck types
- **`lib.rs`** — PyO3 module initialization, top-level `read_elements`/`read_pck` functions

Python type stubs: `autoangel-py/autoangel.pyi`.

### autoangel-wasm
wasm-bindgen bindings exposing `autoangel-core` as an npm package. Uses `default-features = false` (no `memmap2`/filesystem). JS tests use Node.js built-in test runner (`node:test`).

- **`elements.rs`** — `ElementsConfig`, `ElementsData`, `ElementsDataList`, `ElementsDataEntry`
- **`pck.rs`** — `PackageConfig`, `PckPackage`
- **`tests/test.mjs`** — JS tests (requires `wasm-pack build --target nodejs --out-dir pkg-node` first)

Build: `cd autoangel-wasm && wasm-pack build --target web`

## Version bumps

All crates share the same version. When bumping, update **all** of these:
- `autoangel-core/Cargo.toml`
- `autoangel-py/Cargo.toml`
- `autoangel-wasm/Cargo.toml`
- `autoangel-wasm/README.md` — CDN URL in the installation example
- `docs/html/viewer/app.js` — `CDN` const
- `docs/html/viewer/pck-worker.js` — `CDN` const
- `docs/html/viewer/elements.js` — `CDN` const

## CI

GitHub Actions (`.github/workflows/build.yml`): cargo check, cross-platform tests (Windows/Ubuntu/macOS with Python 3.10), rustfmt, clippy, WASM compilation check + JS tests. Version bumps in `autoangel-py/Cargo.toml` or `autoangel-wasm/Cargo.toml` trigger PyPI publishing, npm publishing, and docs update.
