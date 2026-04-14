"""
AutoAngel is a general-purpose library designed to make it easy to work with angelica engine game files.

It supports the following file formats:

- `elements.data` - load with `read_elements`, view, modify and save through the `ElementsData` object.
- `*.pck`/`*.pkx` - load with `read_pck`, explore through the `PckPackage` object.
- `*.ecm` - load with `read_ecm`, inspect composite model structure through the `EcmModel` object.
- `*.smd` - load with `read_smd`, inspect skin model data through the `SmdModel` object.
- `*.bon` - load with `read_skeleton`, inspect skeleton bones and hooks through the `Skeleton` object.
- `*.ski` - load with `read_skin`, inspect meshes, textures and materials through the `Skin` object.
- `*.stck` - load with `read_track_set`, inspect animation tracks through the `TrackSet` object.

## Quick Start

### Working with elements.data

Let's start with importing `autoangel`:

```python
import autoangel
```

Now you can load any `elements.data` you want using `read_elements`:

```python
data = autoangel.read_elements('/path/to/elements.data')
```

By default `read_elements` will try to use one of the bundled config.
This should work for you, if you don't use exotic game version (otherwise, you should load config with `read_elements_config` and pass it manually).

You can inspect `data`:

```python
print(f'Version: {data.version}')
print(f'Number of lists: {len(data)}')
```

You can explore all the entries among all the lists. For example:

```python
weapons_list = data[3]

# print list name
print(f'List: {weapons_list.config.caption}')

# print first 10 entries in list
for i in range(10):
  weapon = weapons_list[i]
  print(f'ID: {weapon.ID}, name: {weapon.Name}')
```

You can also modify anything you want like changing durability of all the weapons:

```python
for weapon in weapons_list:
  weapon.durability_min = weapon.durability_max = 99999
```

All the modifications won't affect original `elements.data` until you save it:

```python
data.save('elements2.data')
```

### Working with pck/pkx

You can load a pck package using `read_pck`:

```python
import autoangel

# Load a single pck file
package = autoangel.read_pck('/path/to/package.pck')

# Load a pck file with its corresponding pkx file
package = autoangel.read_pck('/path/to/package.pck', '/path/to/package.pkx')
```

Once you have a `PckPackage` object, you can explore its contents:

```python
# Get a list of all files in the package
file_list = package.file_list()
print(f'Number of files: {len(file_list)}')

# Find files with a specific prefix
textures = package.find_prefix('textures/')
print(f'Number of texture files: {len(textures)}')

# Get the content of a specific file
file_content = package.get_file('path/to/file.txt')
if file_content is not None:
    print(f'File content: {file_content.decode("utf-8")}')
else:
    print('File not found')
```
"""

from typing import Any, Callable, Iterator, Optional, Literal, List, Union, final

ReadValue = Union[int, float, str, bytes]


@final
class ElementsConfig:
    """
    Configuration for elements.data.

    Attributes:
        lists: **elements.data** lists configs
        name: name of config specified when parsing it (i.e. file name)
    """

    lists: ElementsListConfigArray
    name: Optional[str]


@final
class ElementsData:
    """
    Object describing parsed **elements.data**. It also works as immutable array of data lists (``ElementsDataList``).

    Implements basic list interface such as ``len(..)`` and ``__getitem__``.

    Attributes:
        version: **elements.data** version

    See also: ``ElementsDataList``
    """

    version: int

    def find_entry(self, id: int, space_id: Optional[str] = None, allow_unknown: bool = True) -> Optional[
        "ElementsDataEntry"]:
        """
        Find entry by ID and space ID.

        :param id: Entry ID
        :param space_id: Optional space ID (``None`` by default).
                         If ``None``, find among all the lists, otherwise - only in lists with specified space_id.
        :param allow_unknown: If set, include lists with ``"unknown"`` space_id in search, otherwise - ignore them (``True`` by default).
        :return: Found entry or ``None``
        """
        ...

    def save(self, path: str) -> None:
        """
        Saves **elements.data** to file at ``path``.

        :param path: Path to output file
        :raises Exception: If any I/O error occurs
        """
        ...

    def save_bytes(self) -> bytes:
        """
        Saves **elements.data** to byte array.

        :return: Serialized **elements.data**
        """
        ...

    def __getitem__(self, index: int, /) -> "ElementsDataList": ...

    def __len__(self) -> int: ...

    def __repr__(self) -> str: ...


@final
class ElementsDataEntry:
    """
    Single data entry.

    Implements basic ``dict[str, object]``-like and object-like interface such as ``len(..)``, ``__getattr__``, ``__setattr__``, ``__getitem__``, ``__setitem__`` and ``__contains__``.

    Number of fields, its names and types depend on **elements.data** version and list config.
    Use ``entry.keys()`` to get field names.

    One can access fields with either ``entry['name']`` (by key) or ``entry.name`` (as an attribute) syntax.

    Each field can be read and modified and has one of the following types:

    - ``int``
    - ``float``
    - ``str``
    - ``bytes``

    See also: ``ElementsListConfig``
    """

    def copy(self) -> "ElementsDataEntry":
        """
        Get deep copy of ``self``.

        :return: Deep copy of entry
        """
        ...

    def keys(self) -> List[str]:
        """
        Get entry field names

        :return: Field names
        """
        ...

    def __contains__(self, name: str, /) -> bool: ...

    def __getitem__(self, name: str, /) -> ReadValue: ...

    def __getattr__(self, name: str) -> ReadValue: ...

    def __len__(self) -> int: ...

    def __setattr__(self, name: str, value: Any, /) -> None:
        """
        .. note::
            Setting ``ByteAuto`` and ``Bytes`` fields is not yet supported and will raise ``NotImplementedError``.
        """
        ...

    def __setitem__(self, name: str, value: Any, /) -> None:
        """
        .. note::
            Setting ``ByteAuto`` and ``Bytes`` fields is not yet supported and will raise ``NotImplementedError``.
        """
        ...

    def __repr__(self) -> str: ...

    def __str__(self) -> str: ...


@final
class ElementsDataList:
    """
    Contains data of specific list in **elements.data** such as list info (like ``ElementsListConfig``) and
    all data entries (``ElementsDataEntry``). Implements basic list interface such as ``len(..)``, ``__getitem__`` and ``__setitem__``.

    Attributes:
        config: list config

    See also: ``ElementsDataEntry``.
    """

    config: ElementsListConfig

    def append(self, entry: ElementsDataEntry) -> None:
        """
        Append ``entry`` at the end of list.

        :param entry: New entry
        :raises ValueError: If ``entry`` comes from a list with a different config
        """
        ...

    def __len__(self) -> int: ...

    def __getitem__(self, index: int, /) -> ElementsDataEntry: ...

    def __setitem__(self, index: int, value: ElementsDataEntry, /) -> None: ...

    def __delitem__(self, index: int, /) -> None: ...

    def __iter__(self) -> Iterator[ElementsDataEntry]: ...

    def __repr__(self) -> str: ...


@final
class ElementsListConfig:
    """
    Configuration for a list in elements.data.

    Attributes:
        caption: list caption
        data_type: list data type
        fields: array of fields
        offset: list offset
        space_id: list space id (may be ``"unknown"``)
    """
    caption: str
    data_type: int
    fields: ElementsMetaFieldArray
    offset: Union[int, Literal['AUTO']]
    space_id: str


@final
class ElementsListConfigArray:
    """
    Array of list configurations.
    """

    def __getitem__(self, index: int, /) -> ElementsListConfig: ...

    def __len__(self) -> int: ...


@final
class ElementsMetaField:
    """
    Field metadata.

    Attributes:
        name: field name
        type: field type
    """
    name: str
    type: str


@final
class ElementsMetaFieldArray:
    """
    Array of field metadata.
    """

    def __getitem__(self, index: int, /) -> ElementsMetaField: ...

    def __len__(self) -> int: ...


@final
class FileEntry:
    """
    Metadata for a single file entry in a pck package.
    """
    path: str
    """Normalized file path (lowercase, backslash-separated)."""
    size: int
    """Uncompressed file size in bytes."""
    compressed_size: int
    """Compressed file size in bytes."""
    hash: int
    """CRC32 hash of the compressed (on-disk) file data."""

    def __repr__(self) -> str: ...


@final
class PackageConfig:
    """
    Configuration for pck package encryption keys and guard values.
    """
    key1: int
    key2: int
    guard1: int
    guard2: int

    def __new__(cls, key1: int = 0xA8937462, key2: int = 0x59374231, guard1: int = 0xFDFDFEEE, guard2: int = 0xF00DBEEF) -> "PackageConfig":
        """
        Create a new PackageConfig with optional custom values.

        :param key1: First key value.
        :param key2: Second key value.
        :param guard1: First guard value.
        :param guard2: Second guard value.
        """
        ...

    def __str__(self) -> str:
        """
        Return a string representation of the PackageConfig.

        :return: A string representation of the PackageConfig.
        """
        ...

    def __repr__(self) -> str:
        """
        Return a string representation of the PackageConfig.

        :return: A string representation of the PackageConfig.
        """
        ...


@final
class PckPackage:
    """
    Object describing parsed pck package.
    """

    def file_list(self) -> List[str]:
        """
        Returns list of file paths in package.

        :return: All paths in package.
        """
        ...

    def find_prefix(self, prefix: str) -> List[str]:
        """
        Finds all files in archive with path prefixed by ``prefix``.

        :param prefix: Path prefix.
        :return: All paths in package prefixed by ``prefix`` or empty list if no files were found.
        """
        ...

    def get_file(self, path: str) -> Optional[bytes]:
        """
        Get file content by its path.

        :param path: Path to file inside package.
        :return: ``None`` if file not found. Otherwise, returns file content.
        """
        ...

    def scan_entries(
        self,
        *,
        paths: List[str],
        on_chunk: Callable[[List[FileEntry]], None],
        interval_ms: int = 100,
    ) -> None:
        """
        Scan file entries with metadata (including compressed data CRC32 hashes).
        Hashes are computed from compressed (on-disk) data without decompression.
        Results are delivered in chunks via ``on_chunk`` callback.

        :param paths: List of file paths to scan.
        :param on_chunk: Callback receiving a list of ``FileEntry`` for each chunk.
            Raise an exception to cancel scanning.
        :param interval_ms: Minimum interval in milliseconds between chunk callbacks (``100`` by default).
            The final chunk is always delivered regardless of throttling.
        """
        ...

    def save(self, path: str, config: Optional[PackageConfig] = None) -> None:
        """
        Save the package to a file.

        This method saves the package to a file at the specified path.
        The saved package will be identical to the original when loaded back.

        :param path: Path where to save the package.
        :param config: Custom package configuration. Defaults to None.
        :raises Exception: If any I/O error occurs during saving.
        """
        ...

    def to_builder(self) -> "PackageBuilder":
        """
        Create a builder pre-populated with this package's files.

        :return: A new PackageBuilder with this package's files.
        """
        ...

    def __repr__(self) -> str: ...


@final
class PackageBuilder:
    """
    Builder for creating or modifying pck packages.
    """

    def __init__(self) -> None:
        """
        Create an empty builder (from scratch).
        """
        ...

    def add_file(self, path: str, data: bytes) -> None:
        """
        Add or overwrite a file. Path is normalized internally.

        :param path: File path inside the package.
        :param data: File content as bytes.
        """
        ...

    def remove_file(self, path: str) -> bool:
        """
        Remove a file from the package.

        :param path: File path inside the package.
        :return: True if the file existed, False otherwise.
        """
        ...

    def file_list(self) -> List[str]:
        """
        List the final set of files (source - removed + added), sorted.

        :return: Sorted list of normalized file paths.
        """
        ...

    def save(
        self,
        path: str,
        *,
        version: Optional[int] = None,
        config: Optional[PackageConfig] = None,
    ) -> None:
        """
        Save the package to a file.

        :param path: Output file path.
        :param version: Package format version (default: source version or 0x20002).
        :param config: Package configuration. Defaults to standard Angelica Engine config.
        """
        ...

    def to_bytes(
        self,
        *,
        version: Optional[int] = None,
        config: Optional[PackageConfig] = None,
    ) -> bytes:
        """
        Serialize the package to bytes.

        :param version: Package format version (default: source version or 0x20002).
        :param config: Package configuration. Defaults to standard Angelica Engine config.
        :return: Serialized package bytes.
        """
        ...

    def __repr__(self) -> str: ...


def read_elements(elements_path: str, config: Optional[ElementsConfig] = None) -> ElementsData:
    """
    Parses **elements.data** from file ``elements_path`` and returns ``ElementsData``.
    Doesn't load file content into memory, uses memory-mapped I/O - so file cannot be modified while ``ElementsData`` is alive.

    :param elements_path: Path to **elements.data**.
    :param config: Optional config describing **elements.data** structure (``None`` by default).
                   If no config specified, one of predefined will be used.
    :return: Object describing parsed **elements.data**.
    :raises Exception: If any I/O error occurs, **elements.data** has invalid internal structure or config has incompatible version.
    """
    ...


def read_elements_bytes(content: bytes, config: Optional[ElementsConfig] = None) -> ElementsData:
    """
    Parses **elements.data** from byte array ``content`` and returns ``ElementsData``.

    :param content: Content of **elements.data**.
    :param config: Optional config describing **elements.data** structure (``None`` by default).
                   If no config specified, one of predefined will be used.
    :return: Object describing parsed **elements.data**.
    :raises Exception: If **elements.data** has invalid internal structure or config has incompatible version.
    """
    ...


def read_elements_config(path: str) -> ElementsConfig:
    """
    Parses **elements.data** config from file at path ``path`` and returns ``ElementsConfig`` describing parsed file.

    :param path: Path to elements config.
    :return: Object describing parsed config.
    :raises Exception: If any I/O error occurs or config has invalid internal structure.
    """
    ...


def read_elements_config_string(content: str) -> ElementsConfig:
    """
    Parses **elements.data** config from string ``content`` and returns ``ElementsConfig`` describing parsed file.

    :param content: String containing elements config.
    :return: Object describing parsed config.
    :raises Exception: If config has invalid internal structure.
    """
    ...


def read_pck(
    pck_path: str,
    pkx_paths: Optional[Union[str, List[str]]] = None,
    *,
    config: Optional[PackageConfig] = None,
    on_progress: Optional[Callable[[int, int], None]] = None,
    progress_interval_ms: int = 0,
) -> PckPackage:
    """
    Parses pck package from file at path ``pck_path`` (and optionally pkx file(s)) and returns ``PckPackage`` describing parsed file(s).
    Doesn't load file content into memory, uses memory-mapped I/O - so file(s) cannot be modified while ``PckPackage`` is alive.

    :param pck_path: Path to pck package.
    :param pkx_paths: Optional pkx path(s) — a single string or list of strings (``None`` by default).
    :param config: Custom package configuration. Defaults to None.
    :param on_progress: Optional callback ``(index, total)`` called for each file entry during parsing.
        Raise an exception to cancel parsing.
    :param progress_interval_ms: Minimum interval in milliseconds between progress callbacks (``0`` by default — no throttling).
        The last entry is always reported regardless of throttling.
    :return: Object describing parsed package.
    :raises Exception: If any I/O error occurs or package has invalid internal structure.
    """
    ...


def read_pck_bytes(
    content: bytes,
    config: Optional[PackageConfig] = None,
    *,
    on_progress: Optional[Callable[[int, int], None]] = None,
    progress_interval_ms: int = 0,
) -> PckPackage:
    """
    Parses package from byte array ``content`` and returns ``PckPackage``.

    :param content: Content of package.
    :param config: Custom package configuration. Defaults to None.
    :param on_progress: Optional callback ``(index, total)`` called for each file entry during parsing.
        Raise an exception to cancel parsing.
    :param progress_interval_ms: Minimum interval in milliseconds between progress callbacks (``0`` by default — no throttling).
        The last entry is always reported regardless of throttling.
    :return: Object describing parsed package.
    :raises Exception: If package has invalid internal structure.
    """
    ...


# --- Model types ---


@final
class BoneScaleEntry:
    """Bone scale entry from an ECM model."""
    bone_index: int
    scale: tuple[float, float, float]
    scale_type: Optional[int]


@final
class ChildModel:
    """Child model attachment from an ECM model."""
    name: str
    path: str
    hh_name: str
    cc_name: str


@final
class EcmModel:
    """Parsed ECM (composite model) file."""
    version: int
    skin_model_path: str
    additional_skins: List[str]
    org_color: int
    src_blend: int
    dest_blend: int
    outer_floats: List[float]
    new_bone_scale: bool
    bone_scales: List[BoneScaleEntry]
    scale_base_bone: Optional[str]
    def_play_speed: float
    child_models: List[ChildModel]


@final
class SmdModel:
    """Parsed SMD (skin model data) file."""
    version: int
    skeleton_path: str
    skin_paths: List[str]
    tcks_dir: Optional[str]


@final
class Bone:
    """A single bone in a skeleton."""
    name: str
    parent: int
    children: List[int]
    mat_relative: List[float]
    mat_bone_init: List[float]
    is_fake: bool
    is_flipped: bool


@final
class Hook:
    """A hook (attachment point) in a skeleton."""
    name: str
    hook_type: int
    bone_index: int
    transform: List[float]


@final
class Skeleton:
    """Parsed BON (skeleton) file."""
    version: int
    bones: List[Bone]
    hooks: List[Hook]


@final
class Material:
    """A material definition from a skin file."""
    name: str
    ambient: tuple[float, float, float, float]
    diffuse: tuple[float, float, float, float]
    emissive: tuple[float, float, float, float]
    specular: tuple[float, float, float, float]
    power: float
    two_sided: bool


@final
class SkinMesh:
    """A weighted (skeletal) mesh from a skin file."""
    name: str
    texture_index: int
    material_index: int
    positions: List[float]
    normals: List[float]
    uvs: List[float]
    indices: List[int]
    bone_weights: List[float]
    bone_indices: List[int]


@final
class RigidMesh:
    """A rigid (static) mesh from a skin file."""
    name: str
    bone_index: int
    texture_index: int
    material_index: int
    positions: List[float]
    normals: List[float]
    uvs: List[float]
    indices: List[int]


@final
class Skin:
    """Parsed SKI (skin) file containing meshes, textures, and materials."""
    version: int
    textures: List[str]
    materials: List[Material]
    skin_meshes: List[SkinMesh]
    rigid_meshes: List[RigidMesh]
    bone_names: List[str]
    num_ske_bone: int


@final
class Track:
    """A single animation track (position or rotation keyframes)."""
    frame_rate: int
    track_length_ms: int
    keys: List[float]
    key_frame_ids: Optional[List[int]]


@final
class BoneTrack:
    """Per-bone animation track data."""
    bone_id: int
    position: Track
    rotation: Track


@final
class TrackSet:
    """Parsed STCK (skeleton track set) file."""
    version: int
    anim_start: int
    anim_end: int
    anim_fps: int
    bone_tracks: List[BoneTrack]


def read_ecm(data: bytes) -> EcmModel:
    """
    Parse an ECM (composite model) file from bytes.

    :param data: Raw ECM file content.
    :return: Parsed ECM model.
    :raises ValueError: If the data is not a valid ECM file.
    """
    ...


def read_smd(data: bytes) -> SmdModel:
    """
    Parse an SMD (skin model data) file from bytes.

    :param data: Raw SMD file content.
    :return: Parsed SMD model.
    :raises ValueError: If the data is not a valid SMD file.
    """
    ...


def read_skeleton(data: bytes) -> Skeleton:
    """
    Parse a BON (skeleton) file from bytes.

    :param data: Raw BON file content.
    :return: Parsed skeleton.
    :raises ValueError: If the data is not a valid BON file.
    """
    ...


def read_skin(data: bytes) -> Skin:
    """
    Parse a SKI (skin) file from bytes.

    :param data: Raw SKI file content.
    :return: Parsed skin.
    :raises ValueError: If the data is not a valid SKI file.
    """
    ...


def read_track_set(data: bytes) -> TrackSet:
    """
    Parse a STCK (skeleton track set) file from bytes.

    :param data: Raw STCK file content.
    :return: Parsed track set.
    :raises ValueError: If the data is not a valid STCK file.
    """
    ...
