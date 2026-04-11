import struct
import threading

import pytest
import autoangel
from autoangel import (
    read_elements,
    read_elements_bytes,
    read_elements_config,
    read_elements_config_string,
)

ELEMENTS_V7_PATH = '../test_data/elements/elements_v7.data'
CONFIG_PATH = '../autoangel-core/resources/known_configs/PW_1.2.6_v7.cfg'
CONFIGS_PCK_PATH = '../test_data/packages/configs.pck'


# --- Elements error handling ---

def test_read_elements_empty_bytes():
    with pytest.raises(Exception):
        read_elements_bytes(b'')


def test_read_elements_truncated():
    with pytest.raises(Exception):
        read_elements_bytes(b'\x07\x00')


def test_read_elements_invalid_header():
    with pytest.raises(Exception, match='Unexpected header'):
        read_elements_bytes(b'\x07\x00\x00\x00')


def test_read_elements_no_bundled_config():
    bad_data = struct.pack('<HH', 9999, 0x3000)
    with pytest.raises(Exception, match='no bundled config'):
        read_elements_bytes(bad_data)


def test_read_elements_nonexistent_file():
    with pytest.raises(FileNotFoundError):
        read_elements('/nonexistent/path/elements.data')


def test_read_elements_config_nonexistent():
    with pytest.raises(FileNotFoundError):
        read_elements_config('/nonexistent/config.cfg')


def test_read_elements_config_bad_content():
    with pytest.raises(Exception):
        read_elements_config_string('garbage content')


# --- Package error handling ---

def test_read_pck_empty_bytes():
    with pytest.raises(Exception):
        autoangel.read_pck_bytes(b'')


def test_read_pck_truncated():
    with pytest.raises(Exception):
        autoangel.read_pck_bytes(b'\x00' * 20)


def test_read_pck_with_wrong_guards():
    bad_config = autoangel.PackageConfig(guard1=0x11111111, guard2=0x22222222)
    with pytest.raises(Exception, match='Invalid guard'):
        autoangel.read_pck(CONFIGS_PCK_PATH, config=bad_config)


def test_read_pck_bytes_with_wrong_guards():
    with open(CONFIGS_PCK_PATH, 'rb') as f:
        content = f.read()
    bad_config = autoangel.PackageConfig(guard1=0x11111111)
    with pytest.raises(Exception, match='Invalid guard'):
        autoangel.read_pck_bytes(content, bad_config)


# --- List config mismatch ---

def test_append_mismatched_list():
    data = read_elements(ELEMENTS_V7_PATH)
    list0 = data[0]
    list1 = data[1]
    entry_from_list1 = list1[0].copy()
    with pytest.raises(ValueError, match='list config mismatch'):
        list0.append(entry_from_list1)


def test_setitem_mismatched_list():
    data = read_elements(ELEMENTS_V7_PATH)
    list0 = data[0]
    list1 = data[1]
    entry_from_list1 = list1[0].copy()
    with pytest.raises(ValueError, match='list config mismatch'):
        list0[0] = entry_from_list1


# --- ByteAuto/Bytes unimplemented ---

def test_set_byte_auto_field_raises():
    data = read_elements(ELEMENTS_V7_PATH)
    # List 58 is TALK_PROC with a single ByteAuto field named "RAW"
    talk_proc = data[58]
    if len(talk_proc) > 0:
        entry = talk_proc[0]
        with pytest.raises(NotImplementedError, match='ByteAuto'):
            entry.RAW = b'\x00'


# --- Edge cases: iteration protocol ---

def test_data_iteration_protocol():
    data = read_elements(ELEMENTS_V7_PATH)
    count = 0
    for _ in data:
        count += 1
    assert count == len(data)

    all_lists = list(data)
    assert len(all_lists) == len(data)


def test_list_iteration_protocol():
    data = read_elements(ELEMENTS_V7_PATH)
    lst = data[1]
    entries = list(lst)
    assert len(entries) == len(lst)


# --- Edge cases: field access ---

def test_entry_field_missing():
    data = read_elements(ELEMENTS_V7_PATH)
    entry = data[1][0]
    with pytest.raises(KeyError):
        _ = entry['nonexistent_field']
    with pytest.raises(KeyError):
        entry.nonexistent_field = 42


# --- Edge cases: out-of-bounds access ---

def test_out_of_bounds_access():
    data = read_elements(ELEMENTS_V7_PATH)
    with pytest.raises(IndexError):
        _ = data[99999]
    with pytest.raises(IndexError):
        _ = data[-99999]

    lst = data[1]
    with pytest.raises(IndexError):
        _ = lst[99999]
    with pytest.raises(IndexError):
        _ = lst[-99999]


# --- Edge cases: package ---

def test_get_file_nonexistent():
    package = autoangel.read_pck(CONFIGS_PCK_PATH)
    assert package.get_file('nonexistent/path.txt') is None


# --- Thread safety ---

def test_concurrent_reads():
    data = read_elements(ELEMENTS_V7_PATH)
    errors = []

    def read_all():
        try:
            for lst in data:
                for entry in lst:
                    _ = entry.keys()
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=read_all) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f'Errors during concurrent reads: {errors}'
