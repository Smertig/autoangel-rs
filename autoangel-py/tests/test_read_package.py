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
