import autoangel
import configparser


def _check_package(package: autoangel.PckPackage):
    assert len(package.file_list()) > 0

    merge_cfg = configparser.ConfigParser()
    merge_cfg.read_string(package.get_file('configs/servermerge.ini').decode('utf-16'))
    assert merge_cfg['MERGE_1']['Server_1'] == '笑傲'


def test_read_package_from_bytes():
    test_path = '../test_data/packages/configs.pck'
    with open(test_path, 'rb') as f:
        package = autoangel.read_pck_bytes(f.read())
        _check_package(package)


def test_read_package_from_file():
    test_path = '../test_data/packages/configs.pck'
    _check_package(autoangel.read_pck(test_path))


def test_scan_entries():
    test_path = '../test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    file_list = package.file_list()

    collected = []
    def on_chunk(entries):
        collected.extend(entries)

    package.scan_entries(paths=file_list, on_chunk=on_chunk, interval_ms=0)

    assert len(collected) == len(file_list)

    for entry, path in zip(collected, file_list):
        assert isinstance(entry, autoangel.FileEntry)
        assert entry.path == path
        assert isinstance(entry.size, int)
        assert entry.size >= 0
        assert isinstance(entry.compressed_size, int)
        assert entry.compressed_size >= 0
        assert isinstance(entry.hash, int)


def test_scan_entry_hashes_consistent():
    test_path = '../test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)

    file_list = package.file_list()
    collected1 = []
    package.scan_entries(paths=file_list, on_chunk=lambda entries: collected1.extend(entries), interval_ms=0)
    collected2 = []
    package.scan_entries(paths=file_list, on_chunk=lambda entries: collected2.extend(entries), interval_ms=0)

    for e1, e2 in zip(collected1, collected2):
        assert e1.hash == e2.hash


def test_file_entry_repr():
    test_path = '../test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)

    file_list = package.file_list()
    collected = []
    package.scan_entries(paths=file_list, on_chunk=lambda entries: collected.extend(entries), interval_ms=0)
    assert len(collected) > 0

    r = repr(collected[0])
    assert r.startswith('FileEntry(')
    assert 'path=' in r
    assert 'size=' in r
    assert 'compressed_size=' in r
    assert 'hash=' in r


def test_pck_repr():
    test_path = '../test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    r = repr(package)
    assert r.startswith('PckPackage(')
    assert 'files=' in r


def test_scan_entries_with_paths():
    test_path = '../test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    file_list = package.file_list()
    assert len(file_list) >= 2

    target_paths = [file_list[0], file_list[1]]

    collected = []
    package.scan_entries(paths=target_paths, on_chunk=lambda entries: collected.extend(entries), interval_ms=0)

    assert len(collected) == 2
    assert collected[0].path == target_paths[0]
    assert collected[1].path == target_paths[1]


def test_scan_entries_cancellation():
    test_path = '../test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)

    chunk_count = 0
    def on_chunk(entries):
        nonlocal chunk_count
        chunk_count += 1
        raise RuntimeError("cancelled")

    try:
        package.scan_entries(paths=package.file_list(), on_chunk=on_chunk, interval_ms=0)
        assert False, "should have raised"
    except RuntimeError as e:
        assert "cancelled" in str(e)
    assert chunk_count == 1


def test_scan_entries_chunking():
    test_path = '../test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    total_files = len(package.file_list())

    # With interval_ms=0, each entry should be delivered immediately (one chunk per entry)
    chunks = []
    def on_chunk(entries):
        chunks.append(list(entries))

    package.scan_entries(paths=package.file_list(), on_chunk=on_chunk, interval_ms=0)

    total_entries = sum(len(c) for c in chunks)
    assert total_entries == total_files


def test_read_pck_with_parse_progress():
    test_path = '../test_data/packages/configs.pck'

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
    test_path = '../test_data/packages/configs.pck'
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
    test_path = '../test_data/packages/configs.pck'

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
    test_path = '../test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path, pkx_paths=None)
    _check_package(package)


def test_read_pck_with_empty_pkx_list():
    test_path = '../test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path, pkx_paths=[])
    _check_package(package)
