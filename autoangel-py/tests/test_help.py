from autoangel import *


def test_text_signatures():
    # Elements data functions
    assert read_elements_bytes.__text_signature__ == '(content, config=None)'
    assert read_elements.__text_signature__ == '(elements_path, config=None)'
    assert read_elements_config_string.__text_signature__ == '(content)'
    assert read_elements_config.__text_signature__ == '(path)'

    # PCK functions
    assert read_pck_bytes.__text_signature__ == '(content, config=None, *, on_progress=None, progress_interval_ms=0)'
    assert read_pck.__text_signature__ == '(pck_path, pkx_paths=None, *, config=None, on_progress=None, progress_interval_ms=0)'

    # PackageConfig methods
    assert PackageConfig.__text_signature__ == '(key1=2828235874, key2=1496793649, guard1=4261281518, guard2=4027432687)'

    # ElementsData methods
    assert ElementsData.save.__text_signature__ == '($self, path)'
    assert ElementsData.save_bytes.__text_signature__ == '($self)'
    assert ElementsData.find_entry.__text_signature__ == '($self, id, space_id=None, allow_unknown=True)'

    # ElementsDataList methods
    assert ElementsDataList.append.__text_signature__ == '($self, entry)'

    # ElementsDataEntry methods
    assert ElementsDataEntry.keys.__text_signature__ == '($self)'
    assert ElementsDataEntry.copy.__text_signature__ == '($self)'

    # PckPackage methods
    assert PckPackage.get_file.__text_signature__ == '($self, path)'
    assert PckPackage.find_prefix.__text_signature__ == '($self, prefix)'
    assert PckPackage.file_list.__text_signature__ == '($self)'
    assert PckPackage.save.__text_signature__ == '($self, path, config=None)'
