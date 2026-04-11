import pathlib
import tempfile
import autoangel


def test_save_with_config():
    original_path = '../test_data/packages/configs.pck'
    original_package = autoangel.read_pck(original_path)

    original_files = original_package.file_list()
    assert len(original_files) > 0

    custom_config = autoangel.PackageConfig(
        key1=0xA1B2C3D4,
        key2=0x11223344,
        guard1=0xAABBCCDD,
        guard2=0x55667788
    )

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path1 = temp_dir + "/temp_file1.pck"
        temp_path2 = temp_dir + "/temp_file2.pck"

        original_package.save(temp_path1)
        original_package.save(temp_path2, custom_config)

        # Different encryption configs must produce different file content
        temp_content1 = pathlib.Path(temp_path1).read_bytes()
        temp_content2 = pathlib.Path(temp_path2).read_bytes()
        assert temp_content1 != temp_content2

        saved_package1 = autoangel.read_pck(temp_path1)
        saved_package2 = autoangel.read_pck(temp_path2, config=custom_config)

        saved_files1 = saved_package1.file_list()
        saved_files2 = saved_package2.file_list()
        assert len(saved_files1) == len(original_files)
        assert len(saved_files2) == len(original_files)
        assert set(saved_files1) == set(original_files)
        assert set(saved_files2) == set(original_files)

        for file_path in original_files:
            original_content = original_package.get_file(file_path)
            saved_content1 = saved_package1.get_file(file_path)
            saved_content2 = saved_package2.get_file(file_path)
            assert original_content == saved_content1, f"Content mismatch for file {file_path} in package1"
            assert original_content == saved_content2, f"Content mismatch for file {file_path} in package2"

        # Release PyO3 objects before TemporaryDirectory cleanup (file handles on Windows)
        del saved_package1, saved_package2
