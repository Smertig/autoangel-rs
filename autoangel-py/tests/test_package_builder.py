import pathlib
import tempfile
import autoangel


def test_from_scratch_roundtrip():
    """Create a package from scratch, save to bytes, read back, verify."""
    builder = autoangel.PackageBuilder()
    builder.add_file("configs\\game.ini", b"[Settings]\nfoo=bar")
    builder.add_file("configs\\server.ini", b"[Server]\nhost=localhost")
    builder.add_file("configs\\client.ini", b"[Client]\nfps=60")

    data = builder.to_bytes()
    package = autoangel.read_pck_bytes(data)

    files = package.file_list()
    assert len(files) == 3
    assert set(files) == {"configs\\game.ini", "configs\\server.ini", "configs\\client.ini"}

    assert package.get_file("configs\\game.ini") == b"[Settings]\nfoo=bar"
    assert package.get_file("configs\\server.ini") == b"[Server]\nhost=localhost"
    assert package.get_file("configs\\client.ini") == b"[Client]\nfps=60"


def test_from_scratch_empty():
    """Empty builder produces a valid package with zero files."""
    builder = autoangel.PackageBuilder()
    data = builder.to_bytes()
    package = autoangel.read_pck_bytes(data)
    assert package.file_list() == []


def test_from_scratch_path_normalization():
    """Paths are normalized: lowercase, backslash-separated."""
    builder = autoangel.PackageBuilder()
    builder.add_file("Textures/Foo.DDS", b"data")
    assert builder.file_list() == ["textures\\foo.dds"]

    data = builder.to_bytes()
    package = autoangel.read_pck_bytes(data)
    assert package.get_file("textures\\foo.dds") == b"data"


def test_from_scratch_single_root():
    """From-scratch packages use a single root directory."""
    builder = autoangel.PackageBuilder()
    builder.add_file("gfx\\ui\\icon.dds", b"icon")
    builder.add_file("gfx\\ui\\button.dds", b"button")
    builder.add_file("gfx\\fx\\spark.dds", b"spark")

    files = builder.file_list()
    roots = {f.split("\\")[0] for f in files}
    assert roots == {"gfx"}


def test_file_list_before_save():
    """file_list reflects adds/removes before save."""
    builder = autoangel.PackageBuilder()
    assert builder.file_list() == []

    builder.add_file("data\\a.txt", b"a")
    builder.add_file("data\\c.txt", b"c")
    builder.add_file("data\\b.txt", b"b")
    assert builder.file_list() == ["data\\a.txt", "data\\b.txt", "data\\c.txt"]


def test_from_scratch_save_to_file():
    """Save a from-scratch package to a file, read back, verify."""
    builder = autoangel.PackageBuilder()
    builder.add_file("configs\\test.ini", b"[Test]\nkey=value")
    builder.add_file("configs\\other.ini", b"[Other]\nfoo=bar")

    with tempfile.NamedTemporaryFile(delete=False) as f:
        temp_path = f.name

    try:
        builder.save(temp_path)
        package = autoangel.read_pck(temp_path)

        assert set(package.file_list()) == {"configs\\test.ini", "configs\\other.ini"}
        assert package.get_file("configs\\test.ini") == b"[Test]\nkey=value"
        assert package.get_file("configs\\other.ini") == b"[Other]\nfoo=bar"
    finally:
        del package
        pathlib.Path(temp_path).unlink(missing_ok=True)


def test_from_package_save_to_file():
    """Modify an existing package via builder and save to file."""
    original = autoangel.read_pck('../test_data/packages/configs.pck')
    builder = original.to_builder()
    builder.add_file("configs\\added.txt", b"added")

    with tempfile.NamedTemporaryFile(delete=False) as f:
        temp_path = f.name

    try:
        builder.save(temp_path)
        rebuilt = autoangel.read_pck(temp_path)

        assert "configs\\added.txt" in rebuilt.file_list()
        assert rebuilt.get_file("configs\\added.txt") == b"added"
        for path in original.file_list():
            assert original.get_file(path) == rebuilt.get_file(path)
    finally:
        del rebuilt
        pathlib.Path(temp_path).unlink(missing_ok=True)


def test_from_package_roundtrip():
    """Read existing package, to_builder, save, verify identical."""
    original = autoangel.read_pck('../test_data/packages/configs.pck')
    builder = original.to_builder()

    data = builder.to_bytes()
    rebuilt = autoangel.read_pck_bytes(data)

    assert set(rebuilt.file_list()) == set(original.file_list())
    for path in original.file_list():
        assert original.get_file(path) == rebuilt.get_file(path), f"Content mismatch: {path}"


def test_add_file_to_existing():
    """Add a new file to an existing package."""
    original = autoangel.read_pck('../test_data/packages/configs.pck')
    builder = original.to_builder()

    builder.add_file("configs\\new_file.txt", b"new content")

    data = builder.to_bytes()
    rebuilt = autoangel.read_pck_bytes(data)

    assert "configs\\new_file.txt" in rebuilt.file_list()
    assert rebuilt.get_file("configs\\new_file.txt") == b"new content"
    # Original files still present
    for path in original.file_list():
        assert original.get_file(path) == rebuilt.get_file(path)


def test_remove_file_from_existing():
    """Remove a file from an existing package."""
    original = autoangel.read_pck('../test_data/packages/configs.pck')
    original_files = original.file_list()
    assert len(original_files) > 0
    removed_path = original_files[0]

    builder = original.to_builder()
    result = builder.remove_file(removed_path)
    assert result is True

    data = builder.to_bytes()
    rebuilt = autoangel.read_pck_bytes(data)

    assert removed_path not in rebuilt.file_list()
    assert len(rebuilt.file_list()) == len(original_files) - 1


def test_overwrite_existing_file():
    """Overwrite an existing file with new content."""
    original = autoangel.read_pck('../test_data/packages/configs.pck')
    original_files = original.file_list()
    target_path = original_files[0]

    builder = original.to_builder()
    builder.add_file(target_path, b"replaced content")

    data = builder.to_bytes()
    rebuilt = autoangel.read_pck_bytes(data)

    assert rebuilt.get_file(target_path) == b"replaced content"
    assert len(rebuilt.file_list()) == len(original_files)


def test_remove_then_add_back():
    """Remove a file then add it back with new content."""
    original = autoangel.read_pck('../test_data/packages/configs.pck')
    target_path = original.file_list()[0]

    builder = original.to_builder()
    builder.remove_file(target_path)
    builder.add_file(target_path, b"new version")

    data = builder.to_bytes()
    rebuilt = autoangel.read_pck_bytes(data)

    assert rebuilt.get_file(target_path) == b"new version"


def test_add_then_remove():
    """Add a file then remove it — file absent in output."""
    builder = autoangel.PackageBuilder()
    builder.add_file("data\\temp.txt", b"temp")
    result = builder.remove_file("data\\temp.txt")
    assert result is True
    assert builder.file_list() == []


def test_original_usable_after_to_builder():
    """Original PckPackage remains usable after to_builder (Arc sharing)."""
    original = autoangel.read_pck('../test_data/packages/configs.pck')
    original_files = original.file_list()
    original_content = original.get_file(original_files[0])

    _builder = original.to_builder()

    # Original still works
    assert original.file_list() == original_files
    assert original.get_file(original_files[0]) == original_content


def test_remove_nonexistent_returns_false():
    """remove_file returns False for nonexistent paths."""
    builder = autoangel.PackageBuilder()
    assert builder.remove_file("data\\nonexistent.txt") is False

    original = autoangel.read_pck('../test_data/packages/configs.pck')
    builder2 = original.to_builder()
    assert builder2.remove_file("definitely\\not\\here.txt") is False


def test_remove_already_removed_returns_false():
    """Removing the same file twice: second call returns False."""
    original = autoangel.read_pck('../test_data/packages/configs.pck')
    target_path = original.file_list()[0]

    builder = original.to_builder()
    assert builder.remove_file(target_path) is True
    assert builder.remove_file(target_path) is False
