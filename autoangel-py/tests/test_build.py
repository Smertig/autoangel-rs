import autoangel


def test_build_info():
    assert hasattr(autoangel, "__build__"), "autoangel module should have __build__ attribute"
    assert isinstance(autoangel.__build__, dict), "__build__ should be a dictionary"

    expected_keys = [
        "build",
        "info-time",
        "dependencies",
        "features",
        "host",
        "target"
    ]

    for key in expected_keys:
        assert key in autoangel.__build__, f"__build__ should contain '{key}'"

    assert isinstance(autoangel.__build__["build"], dict), "build should be a dictionary"
    assert isinstance(autoangel.__build__["features"], list), "features should be a list"
