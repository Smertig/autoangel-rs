# autoangel

Python bindings for parsing and manipulating Angelica Engine game files.

## Installation

```bash
pip install autoangel
```

## Quick Start

### Working with elements.data

```python
import autoangel

# Load elements.data file
data = autoangel.read_elements('/path/to/elements.data')

# Inspect data
print(f'Version: {data.version}')
print(f'Number of lists: {len(data)}')

# Access a specific list (e.g., weapons list)
weapons_list = data[3]
print(f'List: {weapons_list.config.caption}')

# Iterate through entries
for i in range(10):
    weapon = weapons_list[i]
    print(f'ID: {weapon.ID}, name: {weapon.Name}')

# Modify entries
for weapon in weapons_list:
    weapon.durability_min = weapon.durability_max = 99999

# Save modifications
data.save('modified_elements.data')
```

### Working with pck/pkx files

```python
import autoangel

# Load package
package = autoangel.read_pck('/path/to/package.pck')

# Or load a paired pck+pkx package
package = autoangel.read_pck('/path/to/package.pck', '/path/to/package.pkx')

# List all files in the package
files = package.file_list()
print(f'Number of files: {len(files)}')

# Find files with a specific prefix
textures = package.find_prefix('textures/')
print(f'Number of texture files: {len(textures)}')

# Extract a specific file
file_content = package.get_file('some/path/in/package.txt')
if file_content:
    with open('extracted_file.txt', 'wb') as f:
        f.write(file_content)
```

## API Reference

### Functions

| Function | Description |
|----------|-------------|
| `read_elements(path, config?)` | Parse elements.data from file (memory-mapped) |
| `read_elements_bytes(content, config?)` | Parse elements.data from bytes |
| `read_elements_config(path)` | Parse elements config from file |
| `read_elements_config_string(content)` | Parse elements config from string |
| `read_pck(path, pkx_path?, config?)` | Parse pck package from file (memory-mapped) |
| `read_pck_bytes(content, config?)` | Parse pck package from bytes |

### Classes

`ElementsData`, `ElementsDataList`, `ElementsDataEntry`, `ElementsConfig`, `ElementsListConfig`, `PackageConfig`, `PckPackage`

Full type stubs are included with the package. See [`autoangel.pyi`](autoangel.pyi) for details.

API documentation is available on [GitHub Pages](https://smertig.github.io/autoangel-rs/master/autoangel.html).

## Key Details

- File-backed parsing uses memory-mapped I/O — source files cannot be modified while `ElementsData` / `PckPackage` objects are alive
- Byte array parsing available via `read_elements_bytes()` / `read_pck_bytes()` when mmap is not desired
- Bundled configs auto-detect game version from the data header; pass your own `ElementsConfig` to override
- Entry fields support both attribute-style (`entry.Name`) and dict-style (`entry['Name']`) access
- Modify fields in-place, then call `data.save(path)` or `data.save_bytes()` to serialize

## Development

Requires [uv](https://docs.astral.sh/uv/) and a Rust toolchain.

```bash
# Build (dev)
uv run maturin develop

# Build (release)
uv run maturin build --release

# Run tests (Python 3.10+ required)
uv run pytest

# Run stubtest
uv run --with mypy python -m mypy.stubtest autoangel --ignore-missing-stub --allowlist stubtest_allowlist.txt
```

Test data uses Git LFS — run `git lfs pull` if tests fail on missing files.

## License

[MIT License](../LICENSE)
