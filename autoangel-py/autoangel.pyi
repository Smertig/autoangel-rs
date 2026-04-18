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
- `*.gfx` - load with `read_gfx`, inspect visual effect elements through the `GfxEffect` object.

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

from typing import Any, Callable, Iterator, Optional, Literal, List, Tuple, Union, final

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
    combine_action_count: int
    co_gfx_count: int

    def combine_action_name(self, i: int) -> str:
        """Name of combined action at index ``i``."""
        ...

    def combine_action_loop_count(self, i: int) -> int:
        """Loop count of combined action at index ``i``."""
        ...

    def combine_action_event_count(self, i: int) -> int:
        """Number of events in combined action at index ``i``."""
        ...

    def event_type(self, action_idx: int, event_idx: int) -> int:
        """
        Event type of event ``event_idx`` in combined action ``action_idx``.

        100 = GFX, 101 = Sound.
        """
        ...

    def event_fx_file_path(self, action_idx: int, event_idx: int) -> str:
        """FX file path of event ``event_idx`` in combined action ``action_idx``."""
        ...

    def event_start_time(self, action_idx: int, event_idx: int) -> int:
        """Start time (ms) of event ``event_idx`` in combined action ``action_idx``."""
        ...

    def event_hook_name(self, action_idx: int, event_idx: int) -> str:
        """Hook name of event ``event_idx`` in combined action ``action_idx``."""
        ...

    def co_gfx_fx_file_path(self, i: int) -> str:
        """FX file path of persistent CoGfx event at index ``i``."""
        ...


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


@final
class Emitter:
    """Particle emitter block — shared emitter fields plus a shape-specific payload."""
    emission_rate: float
    angle: float
    speed: float
    par_acc: Optional[float]
    acc_dir: Tuple[float, float, float]
    acc: float
    ttl: float
    color_min: int
    color_max: int
    scale_min: float
    scale_max: float
    rot_min: Optional[float]
    rot_max: Optional[float]
    is_surface: bool
    is_bind: bool
    is_drag: Optional[bool]
    drag_pow: Optional[float]
    par_ini_dir: Optional[Tuple[float, float, float]]
    is_use_hsv_interp: Optional[bool]
    shape: EmitterShape


class EmitterShape:
    """Emitter-shape-specific payload. Instances are one of the nested
    classes ``EmitterShape.Point`` / ``EmitterShape.Box`` /
    ``EmitterShape.Ellipsoid`` / ``EmitterShape.Cylinder`` /
    ``EmitterShape.MultiPlane`` / ``EmitterShape.Curve``."""

    @final
    class Point:
        pass

    @final
    class Box:
        area_size: Tuple[float, float, float]

    @final
    class Ellipsoid:
        area_size: Tuple[float, float, float]
        is_avg_gen: Optional[bool]
        alpha_seg: Optional[int]
        beta_seg: Optional[int]

    @final
    class Cylinder:
        area_size: Tuple[float, float, float]
        is_avg_gen: Optional[bool]
        alpha_seg: Optional[int]
        beta_seg: Optional[int]

    @final
    class MultiPlane:
        raw_lines: List[str]

    @final
    class Curve:
        raw_lines: List[str]


@final
class GridVertex:
    """Single vertex of a ``GridDecal3D`` grid — position plus packed ARGB color."""
    pos: Tuple[float, float, float]
    color: int


@final
class GridAnimKey:
    """Grid-animation keyframe — modified vertex array at time ``time_ms``."""
    time_ms: int
    vertices: List[GridVertex]


@final
class NoiseCtrl:
    """Perlin noise parameters — prefix of every ``Lightning`` / ``LightningEx`` body."""
    buf_len: int
    amplitude: float
    wave_len: int
    persistence: float
    octave_num: int


@final
class FloatValueTrans:
    """Animatable float value track (v>=102 lightning amplitude)."""
    dest_num: int
    start_time: int
    dest_values: List[float]
    trans_times: List[int]


@final
class LightningFields:
    """Scalar payload shared by ``Lightning`` and ``LightningEx`` bodies."""
    noise_ctrl: NoiseCtrl
    start_pos: Tuple[float, float, float]
    end_pos: Tuple[float, float, float]
    segs: int
    light_num: int
    wave_len: float
    interval: int
    width_start: float
    width_end: float
    alpha_start: Optional[float]
    alpha_end: Optional[float]
    width_mid: Optional[float]
    alpha_mid: Optional[float]
    amplitude: Optional[float]
    amplitude_trans: Optional[FloatValueTrans]
    pos1_enable: bool
    pos2_enable: bool
    use_normal: Optional[bool]
    normal: Optional[Tuple[float, float, float]]
    filter_type: Optional[int]
    wave_moving: Optional[bool]
    wave_moving_speed: Optional[float]
    fix_wave_length: Optional[bool]
    num_waves: Optional[float]


@final
class SoundParamInfo:
    """``GfxSoundParamInfo`` — sound parameter block with its own internal ``sound_ver`` gating."""
    sound_ver: int
    force_2d: bool
    is_loop: bool
    volume_min: int
    volume_max: int
    absolute_volume: Optional[bool]
    pitch_min: Optional[float]
    pitch_max: Optional[float]
    min_dist: float
    max_dist: float
    fix_speed: Optional[bool]
    silent_header: Optional[int]
    percent_start: Optional[float]
    group: Optional[int]


@final
class SoundAudioEvent:
    """Audio-event sub-block present on ``Sound`` bodies at v>=96."""
    event_path: str
    use_custom: bool
    min_dist: float
    max_dist: float


class ElementBody:
    """Typed body for a GFX element. Accessed via :attr:`GfxElement.body`.

    Instances are always one of the nested variant classes
    (``ElementBody.Decal``, ``ElementBody.Trail``, ...,
    ``ElementBody.Unknown``) — ``ElementBody`` itself is the common
    base. Narrow with :func:`isinstance`.
    """

    @final
    class Unknown:
        """Body of an element whose type has no typed parser — raw text lines preserved."""
        lines: List[str]

    @final
    class Decal:
        """Body of a Decal element (types 100 / 101 / 102)."""
        width: float
        height: float
        rot_from_view: bool
        grnd_norm_only: Optional[bool]
        no_scale: Optional[Tuple[bool, bool]]
        org_pt: Optional[Tuple[float, float]]
        z_offset: Optional[float]
        match_surface: Optional[bool]
        surface_use_parent_dir: Optional[bool]
        max_extent: Optional[float]
        yaw_effect: Optional[bool]
        tail_lines: List[str]

    @final
    class Trail:
        """Body of a Trail element (type 110) — ribbon trail between two moving endpoints."""
        org_pos1: Tuple[float, float, float]
        org_pos2: Tuple[float, float, float]
        enable_mat: bool
        enable_org_pos1: bool
        enable_org_pos2: bool
        seg_life: int
        bind: Optional[bool]
        spline: Optional[int]
        sample_freq: Optional[int]
        perturb_mode: Optional[int]
        face_camera: Optional[bool]
        tail_lines: List[str]

    @final
    class Light:
        """Body of a Light element (type 130) — dynamic light source (D3DLIGHT9-style parameters)."""
        light_type: int
        diffuse: int
        specular: int
        ambient: int
        position: Tuple[float, float, float]
        direction: Tuple[float, float, float]
        range: float
        falloff: float
        attenuation0: float
        attenuation1: float
        attenuation2: float
        theta: float
        phi: float
        inner_use: Optional[bool]
        tail_lines: List[str]

    @final
    class Ring:
        """Body of a Ring element (type 140) — expanding ring effect."""
        radius: float
        height: float
        pitch: float
        sects: Optional[int]
        no_rad_scale: Optional[bool]
        no_hei_scale: Optional[bool]
        org_at_center: Optional[bool]
        tail_lines: List[str]

    @final
    class Model:
        """Body of a Model element (type 160) — embedded 3D model reference."""
        model_path: str
        model_act_name: Optional[str]
        loops: Optional[int]
        alpha_cmp: Optional[bool]
        write_z: Optional[bool]
        use_3d_cam: Optional[bool]
        facing_dir: Optional[bool]
        tail_lines: List[str]

    @final
    class Container:
        """Body of a GfxContainer element (type 200) — nested ``.gfx`` reference."""
        gfx_path: str
        out_color: Optional[bool]
        loop_flag: Optional[bool]
        play_speed: Optional[float]
        dummy_use_g_scale: Optional[bool]
        tail_lines: List[str]

    @final
    class Particle:
        """Body of a Particle element (types 120 / 121 / 122 / 123 / 124 / 125)."""
        quota: int
        particle_width: float
        particle_height: float
        three_d_particle: bool
        facing: int
        scale_no_off: Optional[bool]
        no_scale: Optional[Tuple[bool, bool]]
        org_pt: Optional[Tuple[float, float]]
        is_use_par_uv: Optional[bool]
        is_start_on_grnd: Optional[bool]
        stop_emit_when_fade: Optional[bool]
        init_random_texture: Optional[bool]
        z_offset: Optional[float]
        emitter: Emitter
        tail_lines: List[str]

    @final
    class GridDecal3D:
        """Body of a GridDecal3D element (type 210) — freeform ``w × h`` vertex-grid decal."""
        w_number: int
        h_number: int
        vertices: List[GridVertex]
        grid_size: float
        z_offset: Optional[float]
        animation_keys: List[GridAnimKey]
        aff_by_scl: Optional[bool]
        rot_from_view: Optional[bool]
        offset_height: Optional[float]
        always_on_ground: Optional[bool]
        tail_lines: List[str]

    @final
    class Lightning:
        """Body of a Lightning element (type 150) — segmented lightning bolt between two points."""
        fields: LightningFields
        tail_lines: List[str]

    @final
    class LtnBolt:
        """Body of a LtnBolt element (type 151) — branching lightning bolt (no noise prefix)."""
        deviation: float
        step_min: float
        step_max: float
        width_start: float
        width_end: float
        alpha_start: float
        alpha_end: float
        stroke_amp: float
        max_steps: int
        max_branches: int
        interval: int
        per_bolts: int
        circles: int
        tail_lines: List[str]

    @final
    class LightningEx:
        """Body of a LightningEx element (type 152) — extends ``Lightning`` with tail / render-side flags."""
        fields: LightningFields
        is_append: Optional[bool]
        render_side: Optional[int]
        is_tail_disappear: Optional[bool]
        verts_life: Optional[int]
        is_tail_fadeout: Optional[bool]
        tail_lines: List[str]

    @final
    class Sound:
        """Body of a Sound element (type 170) — 3D positional sound emitter."""
        paths: List[str]
        param_info: SoundParamInfo
        audio_event: Optional[SoundAudioEvent]
        tail_lines: List[str]


@final
class GfxElement:
    """A single visual effect element within a GFX file."""
    type_id: int
    name: str
    src_blend: int
    dest_blend: int
    repeat_count: int
    repeat_delay: int
    tex_file: str
    tex_row: int
    tex_col: int
    tex_interval: int
    tile_mode: int
    z_enable: int
    is_dummy: int
    priority: int
    body: ElementBody


@final
class GfxEffect:
    """Parsed GFX (visual effect) file."""
    version: int
    default_scale: float
    play_speed: float
    default_alpha: float
    face_to_viewer: int
    fade_by_dist: int
    fade_start: float
    fade_end: float
    aabb_min: Optional[Tuple[float, float, float]]
    aabb_max: Optional[Tuple[float, float, float]]
    use_aabb: int
    elements: List[GfxElement]


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


def read_gfx(data: bytes) -> GfxEffect:
    """
    Parse a GFX (visual effect) file from bytes.

    :param data: Raw GFX file content.
    :return: Parsed GFX effect.
    :raises ValueError: If the data is not a valid GFX file.
    """
    ...
