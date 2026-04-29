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

Cargo workspace with three crates: `autoangel-core` (Rust library) + two binding crates (`autoangel-py`, `autoangel-wasm`).

### autoangel-core
Core Rust library for parsing Angelica Engine game files:
- **`elements/`** — parsing and manipulation of `elements.data` files (config structures, typed field values, game-specific dialect definitions bundled via `include_dir`)
- **`pck/`** — reading `*.pck`/`*.pkx` compressed game asset packages (keyed encryption, zlib decompression via `miniz_oxide`)
- **`model/`** — Angelica model formats: `bon` (skeleton), `ski` (skin), `smd` (mesh), `ecm` (composite character model), `stck` (animation track sets), `gfx` (effects/particles). Shared `text_reader` and `common` helpers; the `bindable!` macro in `model/mod.rs` conditionally derives PyO3 / tsify bindings on every type that crosses the language boundary.
- **`util/`** — `DataSource`/`DataReader` for backend-agnostic byte access (supports mmap, OPFS), `LineReader` for config parsing

Cargo features gate the binding-side derives: `fs` (default, enables `memmap2`), `python` (PyO3 derives, consumed by `autoangel-py`), `wasm` (`tsify-next` + `wasm-bindgen` derives, consumed by `autoangel-wasm`).

Key patterns: `memmap::Mmap` for zero-copy file I/O, `Arc<T>` shared ownership of parsed data, `parking_lot::RwLock` for mutable entry fields.

### autoangel-py
PyO3 bindings exposing `autoangel-core` as the `autoangel` Python module. Uses `abi3-py37` for broad Python version compatibility. Python tests use pytest (in `autoangel-py/tests/`), not `cargo test`.

- **`elements/`** — `py_config`, `py_data`, `py_value`, `py_util` wrapping core elements types
- **`pck/`** — `py_package`, `py_package_config` wrapping core pck types
- **`model/`** — `py_ecm`, `py_gfx`, `py_skeleton`, `py_skin`, `py_smd`, `py_track_set` wrapping core model types
- **`lib.rs`** — PyO3 module initialization, top-level `read_elements`/`read_pck` functions

Python type stubs: `autoangel-py/autoangel.pyi`.

### autoangel-wasm
wasm-bindgen bindings exposing `autoangel-core` as an npm package. Uses `default-features = false` (no `memmap2`/filesystem). TypeScript tests use Node.js built-in test runner (`node:test`) via `tsx`.

- **`elements.rs`** — `ElementsConfig`, `ElementsData`, `ElementsDataList`, `ElementsDataEntry`
- **`pck.rs`** — `PackageConfig`, `PckPackage`, `PckBuilder`
- **`model.rs`** — model loaders (ecm/gfx/ski/smd/bon/stck) returning the tsify-derived JS types from `autoangel-core::model`
- **`image.rs`** — DDS / TGA decode helpers (used by demos for texture preview)
- **`file_reader.rs`** — JS `File`/`Blob`-backed `DataSource` for browser uploads
- **`tests/test.ts`** — TypeScript tests (requires `wasm-pack build --target nodejs --out-dir pkg-node --out-name autoangel` and `npm ci` first)

Build: `cd autoangel-wasm && wasm-pack build --target web --out-name autoangel`

**Important:** Always pass `--out-name autoangel` to wasm-pack so the output files are named `autoangel.js`/`autoangel.d.ts` instead of the default `autoangel_wasm.js`. Tests and demos import from `autoangel.js`.

### Local demo testing

```bash
uv run scripts/serve.py          # Vite dev server with HMR on port 9853
uv run scripts/serve.py --build  # production build + static serve
```

The `?local` parameter still works for loading WASM from the local build.

Demo source is in `demos/src/` (TypeScript + React). Run `cd demos && npx vitest` for unit tests.

### Three.js + GFX runtime invariants (demos)

These are non-obvious rules that bite anyone adding a new 3D pane or texture-decoding code path:

- **The lazy three loader is the single source of truth for `three`.** `model-viewer/internal/three.ts` exports `ensureThree()` (async) and `getThree()` (sync, throws if not awaited). `loadParticleTexture` and other texture decoders go through `getThree()`, so they fail unless `ensureThree()` was awaited somewhere on the path. **Static `import * as THREE from 'three'` does NOT prime the lazy loader's internal binding** — it imports the module but the loader's `THREE` variable stays null. Always call `await ensureThree()` once at the top of any new initialization that will reach `loadParticleTexture`/`loadThreeTexture`/etc.

- **Particle and decal runtimes deliberately render *nothing* for textureless particles** (engine parity — see `gfx-runtime/particle.ts:36-40`). When `opts.preloadedTextures` lacks the resolved texture path, `spawnParticleRuntime` returns `createNoopRuntime` instead of falling back to a colored quad. Consumers that want visible particles MUST preload textures (via `gfx-runtime/preload.ts:preloadGfxGraph` or equivalent) before spawning. A subtle symptom: every runtime is a noop → all `finished()` return true → auto-loop fires every frame → loop indicators stay lit.

- **`getViewer` (`model-viewer/internal/viewer.ts`) is the right primitive for any new 3D pane, not just the model viewer.** It owns lazy-three loading, render-on-demand scheduling, controls integration (re-arms render on damping motion via `'change'` event), scene disposal, and tab-throttling avoidance. The render loop self-sustains via `isMixerActive() || v.isAuxAnimating?.()`. New panes set `v.scene`, `v.camera`, `v.setControls(...)`, `v.onFrameUpdate`, and `v.isAuxAnimating`; never roll their own renderer + rAF. Toggle `isAuxAnimating` rather than starting/stopping rAF manually.

- **`gfx-runtime/preload.ts:preloadGfxGraph` is the single source of truth for the BFS-load + parallel texture-decode flow.** Both the model viewer's GFX event preload (`render-smd.ts:buildEffectList`) and the standalone GFX viewer (`useGfxPreload`) consume it. Don't reimplement. Pass `seeds: string[]` (resolved engine-prefix paths) and optional `extraElements` for any top-level elements not represented in `preloadedGfx` itself.

- **Engine path resolution: every reference uses `resolveEnginePath(rawPath, ENGINE_PATH_PREFIXES.<kind>, findFile)`.** Prefix tuples are in `gfx/util/resolveEnginePath.ts` (`gfx`, `models`, `textures`, `sound`). Don't hand-prefix paths. PCKs sometimes contain double-`gfx\` entries (`gfx\gfx\textures\...`) for a small subset of files; `findFile` is case-insensitive and the prefix loop tries `gfx\textures\` and `gfx\Textures\`, so both spellings resolve correctly.

- **`bindable!` macro doesn't accept tuple-variant enums.** `Foo(Bar)` breaks PyO3 derive. Use `Foo { bar: Bar }` instead. Applies to every `enum` inside `model/` that crosses the language boundary.

### Demo changelog

User-visible changes surface inside each demo via the sparkle button in `NavBar`, backed by `demos/src/shared/changelog.ts`. The `CHANGELOG` array is hand-edited; first-time visitors get a silent localStorage init so they don't see a dot for historical entries.

**When to add an entry.** Whenever a commit changes something a user opening the demo would *notice*: new feature, new supported file format, changed UX behavior, perceptible perf win, fix for a visibly wrong thing. Add the entry in the same commit as the change when convenient, otherwise as a follow-up. Don't add entries for changes that aren't user-visible (see "What to skip" below).

When adding a new entry:

- **`id`** — stable slug, unique forever. Convention: `YYYY-MM-DD-short-slug`. Don't reuse or rewrite ids; they're the seen-marker keys.
- **`scope`** — one of `'elements' | 'pck' | 'pck-diff' | 'shared'`. Use a demo's scope when the change only affects that demo. Use `'shared'` only when the change touches more than one demo (NavBar, theme, FOUC fix, cross-cutting perf). Model viewer / GFX runtime / particle simulation live inside the pck demo → scope `'pck'`.
- **`title`** — sentence case, no terminal period, ≤60 chars. Pick **one** of these grammatical shapes per entry and don't mix:
  - **Noun phrase** announcing the feature: *"Persistent PCK session history"*, *"3D particle simulation"*.
  - **What the user can now do** (active voice, no subject): *"Click GFX/sound paths to jump to the file"*.
  - No `New:` / `Added:` / `Improved:` prefixes — the changelog is the prefix.
- **`body`** (optional) — one short sentence ending with a period. Describes the user-visible effect, not the implementation. Don't restate the title. Skip entirely if the title is self-sufficient.

**Voice & tone:** terse, factual, no marketing words ("amazing", "blazing", "now powerful"). Plain English over abstractions: prefer concrete verbs like "render", "open", "remember" over abstractions like "polish", "overhaul", "first-class", "native". Numbers beat adjectives. Domain jargon (ECM, GFX, PCK, decal, ski, smd) is fine — the audience is technical.

**Grouping:** bundle same-day related work into one entry. *"Animation list polish"* covering resize + filter + slider + scrubber beats four fragmented bullets. Split only when the work hits genuinely different surfaces.

**What to skip:** refactors, dependency bumps, test infra, CI, doc-only changes, single-line cosmetic fixes, internal helper extractions. The changelog is for users, not commit-log archaeology.

### Demo E2E modes

Demos have two E2E test modes that differ in which wasm they exercise:

| Command | Mode | Types | Runtime | Use when |
|---|---|---|---|---|
| `cd demos && npm run test:e2e` | **pinned** (default, what CI runs) | `node_modules/autoangel` (published) | CDN at pinned version | You haven't touched core/wasm APIs, or you want to verify demos still work against the currently-pinned release. |
| `cd demos && npm run test:e2e:local` | **local** (dev-only, opt-in) | local `autoangel-wasm/pkg` via tsconfig paths alias | local WASM via `?local` query param | You changed core/wasm APIs and updated demos to use them — want full end-to-end verification against the unpublished build. Requires `wasm-pack build --target web --out-name autoangel` in `autoangel-wasm/` so `pkg/` exists. |

`:ui` variants (`test:e2e:ui`, `test:e2e:ui:local`) open Playwright UI mode.

Selection is explicit — no autodetection. If demos source is inconsistent with the chosen mode (e.g., source uses a newly-added API but you run in pinned mode), `tsc` surfaces it immediately as a type error — no separate assertion needed.

## Version bumps

All crates share the same version. When bumping, update **all** of these:
- `autoangel-core/Cargo.toml`
- `autoangel-py/Cargo.toml`
- `autoangel-wasm/Cargo.toml`
- `autoangel-wasm/README.md` — CDN URL in the installation example
- `demos/package.json` — `autoangel` devDependency version (types + CDN version for demos)

### Demo type declarations

`demos/src/types/autoangel.d.ts` re-exports types from the `autoangel` npm package. **Do not manually add type declarations to this file** — all WASM types are auto-generated by `wasm-pack` and published with the npm package. Demo commits go in batch 3 (after npm publish), so types are always available from `node_modules/autoangel`.

### Commit ordering when both API and demos change

Demos load WASM from the published npm CDN (`demos/src/cdn.ts` reads the version from the `autoangel` npm package's `package.json`), so they must never reference an unpublished API. When a change touches both the library API and demos that use the new API, split commits into three batches pushed separately:

1. **API commits** — one or more commits changing core/py/wasm code
2. **Version bump commit** — bump version in all crates + `autoangel-wasm/README.md`, but do **NOT** bump `demos/package.json`'s `autoangel` devDependency (demos still resolve the old published version via the CDN)
3. **Demo commits** — bump `demos/package.json`'s `autoangel` to the new version + demo code using the new API

The owner pushes each batch manually after verifying CI passes on the previous one.

## Worktrees

Use `git worktree` for isolated feature work that might span multiple commits or collide with other in-flight changes. Two directory conventions in use:

- **`.worktrees/<branch-name>/`** — project-local, hidden. The `.worktrees` line in `.gitignore` keeps the directory untracked. Default choice.
- **Sibling directory `../<project>-<tag>/`** — peer of the main checkout (e.g. `autoangel-rs-hlsl`, `autoangel-rs-ecm-gfx`). Useful when the worktree will own resource-heavy builds you don't want nested inside the main tree.

### Per-worktree setup checklist

Git only carries tracked files. **Everything below is gitignored and must be set up in every new worktree**, or tests and builds won't work:

1. **LFS content** — `git lfs pull` inside the worktree. Test data in `test_data/` are LFS pointers until hydrated. The LFS object store lives in the main `.git/lfs/` (shared), but checkout is per-worktree.
2. **`demos/node_modules/`** — `cd demos && npm ci`.
3. **`autoangel-wasm/pkg/`** (web target) — `cd autoangel-wasm && wasm-pack build --target web --out-name autoangel`. Required for `test:e2e:local` and the `?local` dev param.
4. **`autoangel-wasm/pkg-node/`** (nodejs target) — `cd autoangel-wasm && wasm-pack build --target nodejs --out-dir pkg-node --out-name autoangel`. Required for `autoangel-wasm && npm test`.
5. **`autoangel-py/.venv/`** — created lazily on first `uv run`. If Python tests throw unexpected `AttributeError`/`TypeError` in a worktree, delete `.venv` and let `uv run` recreate it (same `globwalk`-cache-keys bug noted in the Build section — it misses cross-worktree `.rs` changes).
6. **`target/`** — cargo rebuilds cold. Slow first `cargo build`, harmless. Cross-worktree concurrent `cargo` / `wasm-pack` invocations serialize safely on Cargo's per-target-dir flock.
7. **`/docs/plans/`** — gitignored. Design/plan docs don't carry into worktrees automatically; hand-copy from the main tree.

### Behavioral gotchas

- **Stale worktree metadata** — if a worktree directory is deleted from disk while git still references it, `git worktree list` keeps showing the zombie. Run `git worktree remove <path>` (or `git worktree prune` if the dir is already gone) to clean up.
- **Relative paths inside a worktree** can be confusing when a subshell `cd`s: `.worktrees/` seen from `autoangel-rs/.worktrees/foo/` does not exist — use absolute paths in cross-tree scripts.
- **Don't delete or merge worktree branches without the owner's permission.** Branches may represent paused or abandoned work; the owner decides.

## CI

GitHub Actions (`.github/workflows/build.yml`): cargo check, cross-platform tests (Windows/Ubuntu/macOS with Python 3.10), rustfmt, clippy, WASM compilation check + JS tests. Version bumps in `autoangel-py/Cargo.toml` or `autoangel-wasm/Cargo.toml` trigger PyPI publishing, npm publishing, and docs update.
