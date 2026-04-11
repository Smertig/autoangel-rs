import pytest
from autoangel import *


CONFIG_PATH = '../autoangel-core/resources/known_configs/PW_1.2.6_v7.cfg'
ELEMENTS_V7_PATH = '../test_data/elements/elements_v7.data'


def test_config():
    config = read_elements_config(CONFIG_PATH)
    assert config.name == 'PW_1.2.6_v7.cfg'
    assert len(config.lists) == 119
    assert config.lists[0].caption == 'EQUIPMENT_ADDON'
    assert config.lists[0].offset == 0
    assert config.lists[0].data_type == 1
    assert config.lists[0].space_id == 'addon'
    assert len(config.lists[0].fields) == 6
    assert config.lists[0].fields[0].name == 'ID'
    assert config.lists[0].fields[0].type == 'i32'


def _check_data(data: ElementsData):
    list = data[1]

    # list access
    assert list.config.caption == 'WEAPON_MAJOR_TYPE'
    assert list.config.offset == 0
    assert list.config.data_type == 2
    assert list.config.space_id == 'essence'

    # entry access
    entry = list[1]
    assert entry.ID == 5
    assert entry['ID'] == 5
    assert 'ID' in entry
    assert 'foobar' not in entry
    assert len(entry) == 2
    assert entry.keys() == ['ID', 'Name']

    # cloning
    entry2 = entry.copy()
    assert entry != entry2
    assert entry2.ID == entry.ID
    entry2.Name += '1'
    assert entry.Name != entry2.Name

    # list modification
    assert len(list) == 7

    del list[1]
    assert list[1].ID == 9
    assert len(list) == 6

    list[1].ID += 1
    assert list[1].ID == 10

    entry3 = list[4].copy()
    entry3.ID = 666
    assert list[4].ID != 666
    list[5] = entry3
    assert list[5].ID == 666
    entry3.ID = 777
    assert list[5].ID == 777

    list.append(list[0].copy())
    assert len(list) == 7
    assert list[0].ID == list[-1].ID

    assert data[0][6].Name == 'A_A22'
    data[0][6].Name = 'foo'
    assert data[0][6].Name == 'foo'
    with pytest.raises(Exception):
        data[0][6].Name = '1' * 500
    assert data[0][6].Name == 'foo'

    entry = data.find_entry(10)
    assert entry is not None and entry.ID == 10

    entry = data.find_entry(10, 'essence')
    assert entry is not None and entry.ID == 10 and entry.Name == '斧锤'

    entry = data.find_entry(10, 'face')
    assert entry is not None and entry.ID == 10 and entry.Name == '女眼型a01'

    entry = data.find_entry(999999)
    assert entry is None

    # Test sequence protocol
    for _ in list:
        pass

    with pytest.raises(Exception, match='index 7 is out of range'):
        for i in range(0, 100):
            _ = list[i]

    with pytest.raises(Exception, match='negative index -8 is out of range'):
        for i in range(0, -100, -1):
            _ = list[i]


def test_data_from_bytes():
    config = read_elements_config(CONFIG_PATH)
    with open(ELEMENTS_V7_PATH, 'rb') as f:
        _check_data(read_elements_bytes(f.read(), config))


def test_data_from_file():
    config = read_elements_config(CONFIG_PATH)
    _check_data(read_elements(ELEMENTS_V7_PATH, config))


def test_data_without_config():
    _check_data(read_elements(elements_path=ELEMENTS_V7_PATH))


def test_roundtrip():
    with open(ELEMENTS_V7_PATH, 'rb') as f:
        b1 = f.read()
    b2 = read_elements_bytes(content=b1).save_bytes()
    assert b1 == b2


def test_elements_data_repr():
    data = read_elements(ELEMENTS_V7_PATH)
    r = repr(data)
    assert r.startswith('ElementsData(')
    assert 'version=' in r


def test_elements_data_list_repr():
    data = read_elements(ELEMENTS_V7_PATH)
    lst = data[0]
    r = repr(lst)
    assert r.startswith('ElementsDataList(')
    assert 'caption=' in r


def test_elements_data_entry_repr():
    data = read_elements(ELEMENTS_V7_PATH)
    entry = data[1][0]
    r = repr(entry)
    assert len(r) > 0


def test_elements_data_entry_str():
    data = read_elements(ELEMENTS_V7_PATH)
    entry = data[1][0]
    s = str(entry)
    assert len(s) > 0
