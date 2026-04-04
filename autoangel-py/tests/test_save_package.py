import pathlib
import tempfile
import configparser
import autoangel


def test_save_package():
    original_path = '../tests/test_data/packages/configs.pck'
    original_package = autoangel.read_pck(original_path)

    original_files = original_package.file_list()
    assert len(original_files) > 0

    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
        temp_path = temp_file.name

    try:
        original_package.save(temp_path)

        saved_package = autoangel.read_pck(temp_path)

        saved_files = saved_package.file_list()
        assert len(saved_files) == len(original_files)
        assert set(saved_files) == set(original_files)

        for file_path in original_files:
            original_content = original_package.get_file(file_path)
            saved_content = saved_package.get_file(file_path)
            assert original_content == saved_content, f"Content mismatch for file {file_path}"

        merge_cfg = configparser.ConfigParser()
        merge_cfg.read_string(saved_package.get_file('configs/servermerge.ini').decode('utf-16'))
        assert merge_cfg['MERGE_1']['Server_1'] == '笑傲'

    finally:
        # Release PyO3 object before deleting file (holds file handle on Windows)
        del saved_package
        pathlib.Path(temp_path).unlink(missing_ok=True)
