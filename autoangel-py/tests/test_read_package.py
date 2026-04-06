import autoangel
import configparser


def _check_package(package: autoangel.PckPackage):
    assert len(package.file_list()) > 0

    merge_cfg = configparser.ConfigParser()
    merge_cfg.read_string(package.get_file('configs/servermerge.ini').decode('utf-16'))
    assert merge_cfg['MERGE_1']['Server_1'] == '笑傲'


def test_read_package_from_bytes():
    test_path = '../tests/test_data/packages/configs.pck'
    with open(test_path, 'rb') as f:
        package = autoangel.read_pck_bytes(f.read())
        _check_package(package)


def test_read_package_from_file():
    test_path = '../tests/test_data/packages/configs.pck'
    _check_package(autoangel.read_pck(test_path))


def test_file_entries():
    test_path = '../tests/test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    entries = package.file_entries()
    file_list = package.file_list()

    assert len(entries) == len(file_list)

    for entry, path in zip(entries, file_list):
        assert isinstance(entry, autoangel.FileEntry)
        assert entry.path == path
        assert isinstance(entry.size, int)
        assert entry.size >= 0
        assert isinstance(entry.compressed_size, int)
        assert entry.compressed_size >= 0
        assert isinstance(entry.hash, int)


def test_file_entry_hashes_consistent():
    test_path = '../tests/test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    entries1 = package.file_entries()
    entries2 = package.file_entries()

    for e1, e2 in zip(entries1, entries2):
        assert e1.hash == e2.hash


def test_file_entry_repr():
    test_path = '../tests/test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    entries = package.file_entries()
    assert len(entries) > 0

    r = repr(entries[0])
    assert r.startswith('FileEntry(')
    assert 'path=' in r
    assert 'size=' in r
    assert 'compressed_size=' in r
    assert 'hash=' in r


def test_pck_repr():
    test_path = '../tests/test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    r = repr(package)
    assert r.startswith('PckPackage(')
    assert 'files=' in r


def test_file_entries_with_progress():
    test_path = '../tests/test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    total_files = len(package.file_list())

    collected = []
    def on_progress(path, index, total):
        collected.append((path, index, total))

    entries = package.file_entries(on_progress=on_progress)
    assert len(collected) == total_files
    for i, (path, index, total) in enumerate(collected):
        assert index == i
        assert total == total_files
        assert path == entries[i].path


def test_file_entries_progress_cancellation():
    test_path = '../tests/test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)

    call_count = 0
    def on_progress(path, index, total):
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            raise RuntimeError("cancelled")

    try:
        package.file_entries(on_progress=on_progress)
        assert False, "should have raised"
    except RuntimeError as e:
        assert "cancelled" in str(e)
    assert call_count == 2


def test_read_pck_with_parse_progress():
    test_path = '../tests/test_data/packages/configs.pck'

    collected = []
    def on_progress(index, total):
        collected.append((index, total))

    package = autoangel.read_pck(test_path, on_progress=on_progress)
    total_files = len(package.file_list())
    assert len(collected) == total_files
    for i, (index, total) in enumerate(collected):
        assert index == i
        assert total == total_files


def test_read_pck_bytes_with_parse_progress():
    test_path = '../tests/test_data/packages/configs.pck'
    with open(test_path, 'rb') as f:
        content = f.read()

    collected = []
    def on_progress(index, total):
        collected.append((index, total))

    package = autoangel.read_pck_bytes(content, on_progress=on_progress)
    total_files = len(package.file_list())
    assert len(collected) == total_files
    for i, (index, total) in enumerate(collected):
        assert index == i
        assert total == total_files


def test_read_pck_parse_progress_cancellation():
    test_path = '../tests/test_data/packages/configs.pck'

    call_count = 0
    def on_progress(index, total):
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            raise RuntimeError("cancelled")

    try:
        autoangel.read_pck(test_path, on_progress=on_progress)
        assert False, "should have raised"
    except RuntimeError as e:
        assert "cancelled" in str(e)
    assert call_count == 2


def test_read_pck_with_pkx_paths_none():
    test_path = '../tests/test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path, pkx_paths=None)
    _check_package(package)


def test_read_pck_with_empty_pkx_list():
    test_path = '../tests/test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path, pkx_paths=[])
    _check_package(package)
