# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
cargo build                       # debug build
cargo build --release             # release build (LTO enabled)

cargo test -p autoangel-core           # Rust tests
cd autoangel-py && uv run pytest       # Python tests (auto-rebuilds extension if .rs files changed)
# NOTE: if Python tests fail with unexpected AttributeError/TypeError after
# cherry-picks or branch switches, delete autoangel-py/.venv and retry.
# The uv cache-keys glob for ../autoangel-core changes is broken (globwalk bug).

cargo fmt --all -- --check             # check formatting
cargo clippy --all-features            # lint
```

Requires [uv](https://docs.astral.sh/uv/). Test data in `test_data/` uses Git LFS — fetch with `git lfs pull` if tests fail on missing data.

**Always** set `PYTHONIOENCODING=utf-8` when running Python scripts or one-liners that may print non-ASCII text (file paths contain Chinese characters).

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
uv run scripts/rebuild_docs.py  # rebuild HTML docs
```

Rebuild docs after any change to the public API: type stubs (`.pyi`), PyO3 bindings, or public Rust types/signatures. Include the regenerated docs in the commit.

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
wasm-bindgen bindings exposing `autoangel-core` as an npm package. Uses `default-features = false` (no `memmap2`/filesystem). TypeScript tests use Node.js built-in test runner (`node:test`) via `tsx`.

- **`elements.rs`** — `ElementsConfig`, `ElementsData`, `ElementsDataList`, `ElementsDataEntry`
- **`pck.rs`** — `PackageConfig`, `PckPackage`
- **`tests/test.ts`** — TypeScript tests (requires `wasm-pack build --target nodejs --out-dir pkg-node` and `npm ci` first)

Build: `cd autoangel-wasm && wasm-pack build --target web`

### Local demo testing

```bash
uv run scripts/serve.py          # Vite dev server with HMR on port 9853
uv run scripts/serve.py --build  # production build + static serve
```

The `?local` parameter still works for loading WASM from the local build.

Demo source is in `demos/src/` (TypeScript + React). Run `cd demos && npx vitest` for unit tests.

## Version bumps

All crates share the same version. When bumping, update **all** of these:
- `autoangel-core/Cargo.toml`
- `autoangel-py/Cargo.toml`
- `autoangel-wasm/Cargo.toml`
- `autoangel-wasm/README.md` — CDN URL in the installation example
- `demos/src/cdn.ts` — `CDN_PKG` const (single source of truth for all demo pages)

### Commit ordering when both API and demos change

Demos load WASM from the published npm CDN, so they must never reference an unpublished API. When a change touches both the library API and demos that use the new API, split commits into three batches pushed separately:

1. **API commits** — one or more commits changing core/py/wasm code
2. **Version bump commit** — bump version in all crates + README, but do **NOT** update `cdn.js` (demos still reference the old published version)
3. **Demo commits** — update `cdn.js` to the new version + demo code using the new API

The owner pushes each batch manually after verifying CI passes on the previous one.

## CI

GitHub Actions (`.github/workflows/build.yml`): cargo check, cross-platform tests (Windows/Ubuntu/macOS with Python 3.10), rustfmt, clippy, WASM compilation check + JS tests. Version bumps in `autoangel-py/Cargo.toml` or `autoangel-wasm/Cargo.toml` trigger PyPI publishing, npm publishing, and docs update.
