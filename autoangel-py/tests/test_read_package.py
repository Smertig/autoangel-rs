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


def test_pck_repr():
    test_path = '../tests/test_data/packages/configs.pck'
    package = autoangel.read_pck(test_path)
    r = repr(package)
    assert r.startswith('PckPackage(')
    assert 'files=' in r
