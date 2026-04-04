# Autoangel

A library for parsing and manipulating Angelica Engine game files, with Python and WebAssembly bindings.

> Rust rewrite of my old [autoangel](https://github.com/Smertig/autoangel) C++ library, now with Python and WASM bindings. Started in 2020, worked on it on and off until 2023. Finally done right. Don't really do PW stuff anymore, but why not publish it.

## Features

- Parse and manipulate `elements.data` files (list structures, typed fields, roundtrip serialization)
- Read and extract files from `*.pck`/`*.pkx` compressed packages (keyed encryption, zlib decompression)
- Bundled configs for known game versions (auto-detected from data version header)

## Packages

| Package | Target | Install | |
|---------|--------|---------|---|
| [`autoangel`](autoangel-py/) | Python 3.10+ | `pip install autoangel` | [README](autoangel-py/README.md) |
| [`autoangel`](autoangel-wasm/) | Browser / Node.js | `npm i autoangel` | [README](autoangel-wasm/README.md) |

The core parsing logic lives in [`autoangel-core/`](autoangel-core/) (Rust, not published separately).

## Quick Examples

**Python**

```python
import autoangel

data = autoangel.read_elements('elements.data')
weapon = data[3][0]
print(f'{weapon.ID}: {weapon.Name}')
```

**JavaScript**

```js
import init, { ElementsData } from 'autoangel';
await init();

const data = ElementsData.parse(new Uint8Array(buffer));
const entry = data.getList(3).getEntry(0);
console.log(entry.getField('Name'));
```

See subcrate READMEs for full examples.

## Development

### Prerequisites

- Rust 1.94.1+
- [uv](https://docs.astral.sh/uv/) (for Python)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (for WASM)

### Build

```bash
cargo build                                              # all crates
cd autoangel-py && uv run maturin build --release        # Python wheel
cd autoangel-wasm && wasm-pack build --target web        # WASM package
```

### Test

```bash
cargo test -p autoangel-core                             # Rust
cd autoangel-py && uv run pytest                         # Python
cd autoangel-wasm && node --test tests/test.mjs          # WASM (build for Node.js first)
```

### Lint

```bash
cargo fmt --all -- --check
cargo clippy --all-features
```

### Benchmarks

Benchmark results are published to [GitHub Pages](https://smertig.github.io/autoangel-rs/dev/bench/) on each push to master.

```bash
cd autoangel-core && cargo bench
```

## Documentation

- [Python API docs](https://smertig.github.io/autoangel-rs/master/autoangel.html)
- [PCK Viewer demo](https://smertig.github.io/autoangel-rs/master/viewer/) (uses autoangel WASM package)

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
