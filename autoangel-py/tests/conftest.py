import sys


def pytest_configure(config):
    if sys.prefix == sys.base_prefix:
        raise RuntimeError(
            "Tests must be run inside a virtual environment. "
            "Run: uv venv .venv && uv run pytest"
        )
