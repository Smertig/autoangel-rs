# autoangel-wasm

WebAssembly bindings for parsing Angelica Engine game files in the browser and Node.js.

## Installation

### npm

```bash
npm install autoangel
```

### CDN

```js
import init, { ElementsData, PckPackage } from 'https://cdn.jsdelivr.net/npm/autoangel@0.13.0/autoangel.js';
await init();
```

## Usage

### Browser — elements.data

```js
import init, { ElementsData } from 'autoangel';

await init();

const response = await fetch('elements.data');
const bytes = new Uint8Array(await response.arrayBuffer());

const data = ElementsData.parse(bytes);
console.log(`Version: ${data.version}, lists: ${data.listCount}`);

const list = data.getList(3);
console.log(`List: ${list.caption}, entries: ${list.entryCount}`);

const entry = list.getEntry(0);
console.log(`Name: ${entry.getField('Name')}`);

entry.free();
list.free();
data.free();
```

### Browser — pck packages

```js
import init, { PckPackage } from 'autoangel';

await init();

const bytes = new Uint8Array(await file.arrayBuffer());
const pkg = PckPackage.parse(bytes);

console.log(`Files: ${pkg.fileCount}`);

const content = pkg.getFile('some/path/in/package.txt');
// content is Uint8Array or undefined

pkg.free();
```

### Node.js

```js
import { readFileSync } from 'node:fs';
import { ElementsData } from './pkg-node/autoangel.js';

const bytes = readFileSync('elements.data');
const data = ElementsData.parse(bytes);
// ... same API as browser
data.free();
```

Build for Node.js with `wasm-pack build --target nodejs --out-dir pkg-node --out-name autoangel`.

## Memory Management

WASM objects allocate memory on the WASM heap and must be freed manually:

```js
const data = ElementsData.parse(bytes);
// ... use data ...
data.free();
```

With [explicit resource management](https://github.com/tc39/proposal-explicit-resource-management) (TypeScript 5.2+):

```ts
using data = ElementsData.parse(bytes);
// automatically freed at end of scope
```

Objects that are not freed will leak memory until the page is reloaded.

## API Reference

### `ElementsConfig`

| | |
|---|---|
| `ElementsConfig.parse(content, game)` | Parse config from text for a given game dialect |
| `.name` | Config name (or `undefined`) |
| `.listCount` | Number of lists |

### `ElementsData`

| | |
|---|---|
| `ElementsData.parse(bytes, config?)` | Parse from `Uint8Array`; auto-detects config if omitted |
| `.version` | Data format version |
| `.listCount` | Number of lists |
| `.getList(index)` | Get list by index |
| `.findEntry(id)` | Find entry by ID across all lists |
| `.saveBytes()` | Serialize to `Uint8Array` |

### `ElementsDataList`

| | |
|---|---|
| `.caption` | List name |
| `.entryCount` | Number of entries |
| `.getEntry(index)` | Get entry by index |
| `.fieldNames()` | Get field name list |

### `ElementsDataEntry`

| | |
|---|---|
| `.getField(name)` | Get field value by name |
| `.keys()` | Get all field names |
| `.toString()` | String representation |

### `PackageConfig`

| | |
|---|---|
| `new PackageConfig()` | Create with default encryption keys |
| `PackageConfig.withKeys(k1, k2, g1, g2)` | Create with custom keys |
| `.key1`, `.key2`, `.guard1`, `.guard2` | Key/guard values |

### `PckPackage`

| | |
|---|---|
| `PckPackage.parse(bytes, config?)` | Parse from `Uint8Array` |
| `.version` | Package format version |
| `.fileCount` | Number of files |
| `.fileList()` | Get all file paths |
| `.findPrefix(prefix)` | Find files matching prefix |
| `.getFile(path)` | Extract file content (`Uint8Array` or `undefined`) |

Full TypeScript definitions are included in the package (`autoangel.d.ts`).

## Live Demo

A browser-based PCK viewer built with this package is available at [smertig.github.io/autoangel-rs/demo/pck](https://smertig.github.io/autoangel-rs/master/demo/pck/).

An elements.data viewer is also available at [smertig.github.io/autoangel-rs/demo/elements](https://smertig.github.io/autoangel-rs/master/demo/elements/).

## Development

Requires Rust (1.94.1+), [wasm-pack](https://rustwasm.github.io/wasm-pack/), and Node.js 20+.

```bash
# Build for browser
wasm-pack build --target web --out-name autoangel

# Build for Node.js
wasm-pack build --target nodejs --out-dir pkg-node --out-name autoangel

# Run tests (requires Node.js build)
npm ci && npx tsx --test tests/test.ts
```

> **Note:** Always pass `--out-name autoangel` so output files are named `autoangel.js` / `autoangel.d.ts`. Tests and demos depend on this name.

The crate depends on `autoangel-core` with `default-features = false` — no filesystem or mmap, all parsing works from byte arrays.

## License

[MIT License](../LICENSE)
