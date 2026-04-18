"""Gold-file tests for the GFX Python binding.

For each `test_data/gfx/*.gfx`, parse the file, walk the full `GfxEffect`
via the Python binding (calling every public getter on every field of
every nested pyclass), and compare against the committed `.gfx.json`
golden. A missing / renamed / broken getter surfaces as AttributeError
or a dict diff.
"""
import json
import pathlib

import autoangel
import pytest

from gfx_golden_walker import to_dict

GFX_DIR = pathlib.Path(__file__).parent.parent.parent / "test_data" / "gfx"

FIXTURES = sorted(GFX_DIR.glob("*.gfx"))
assert FIXTURES, f"no .gfx fixtures found in {GFX_DIR}"


@pytest.mark.parametrize("gfx_path", FIXTURES, ids=lambda p: p.stem)
def test_gfx_matches_golden(gfx_path: pathlib.Path) -> None:
    golden_path = gfx_path.with_suffix(".gfx.json")
    assert golden_path.exists(), (
        f"missing golden {golden_path.name} — run scripts/update_gfx_goldens.py"
    )
    gfx = autoangel.read_gfx(gfx_path.read_bytes())
    actual = to_dict(gfx)
    expected = json.loads(golden_path.read_text(encoding="utf-8"))
    assert actual == expected
