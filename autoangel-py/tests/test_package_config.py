import pytest
import autoangel


def test_package_config():
    config = autoangel.PackageConfig()

    custom_config = autoangel.PackageConfig(
        key1=0x12345678,
        key2=0x87654321,
        guard1=0xAABBCCDD,
        guard2=0xDDCCBBAA
    )

    partial_config = autoangel.PackageConfig(
        key1=0x12345678,
        guard2=0xDDCCBBAA
    )

    with pytest.raises(FileNotFoundError):
        autoangel.read_pck("nonexistent.pck", config=config)

    default_str = str(config)
    default_repr = repr(config)
    expected_default_str = "PackageConfig(key1=0xA8937462, key2=0x59374231, guard1=0xFDFDFEEE, guard2=0xF00DBEEF)"
    assert default_str == expected_default_str
    assert default_repr == expected_default_str

    custom_str = str(custom_config)
    custom_repr = repr(custom_config)
    expected_custom_str = "PackageConfig(key1=0x12345678, key2=0x87654321, guard1=0xAABBCCDD, guard2=0xDDCCBBAA)"
    assert custom_str == expected_custom_str
    assert custom_repr == expected_custom_str

    partial_str = str(partial_config)
    partial_repr = repr(partial_config)
    expected_partial_str = "PackageConfig(key1=0x12345678, key2=0x59374231, guard1=0xFDFDFEEE, guard2=0xDDCCBBAA)"
    assert partial_str == expected_partial_str
    assert partial_repr == expected_partial_str

    assert config.key1 == 0xA8937462
    assert config.key2 == 0x59374231
    assert config.guard1 == 0xFDFDFEEE
    assert config.guard2 == 0xF00DBEEF

    assert custom_config.key1 == 0x12345678
    assert custom_config.key2 == 0x87654321
    assert custom_config.guard1 == 0xAABBCCDD
    assert custom_config.guard2 == 0xDDCCBBAA

    assert partial_config.key1 == 0x12345678
    assert partial_config.key2 == 0x59374231
    assert partial_config.guard1 == 0xFDFDFEEE
    assert partial_config.guard2 == 0xDDCCBBAA

    config.key1 = 0x11111111
    config.key2 = 0x22222222
    config.guard1 = 0x33333333
    config.guard2 = 0x44444444

    assert config.key1 == 0x11111111
    assert config.key2 == 0x22222222
    assert config.guard1 == 0x33333333
    assert config.guard2 == 0x44444444

    modified_str = str(config)
    expected_modified_str = "PackageConfig(key1=0x11111111, key2=0x22222222, guard1=0x33333333, guard2=0x44444444)"
    assert modified_str == expected_modified_str
