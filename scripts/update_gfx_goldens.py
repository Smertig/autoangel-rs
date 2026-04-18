# /// script
# requires-python = ">=3.10"
# dependencies = ["autoangel"]
#
# [tool.uv.sources]
# autoangel = { path = "../autoangel-py" }
# ///
"""Regenerate `test_data/gfx/*.gfx.json` goldens from the current Python
binding output. Run after an intentional parser / binding change; review
the diff; commit the updated goldens along with the change.

Usage:
  uv run scripts/update_gfx_goldens.py
"""
import json
import pathlib
import sys

import autoangel

PROJECT_DIR = pathlib.Path(__file__).parent.parent
GFX_DIR = PROJECT_DIR / "test_data" / "gfx"

# The walker lives in the tests tree — reuse it so goldens are exactly
# what the test compares against.
sys.path.insert(0, str(PROJECT_DIR / "autoangel-py" / "tests"))
from gfx_golden_walker import to_dict  # noqa: E402


def main() -> None:
    fixtures = sorted(GFX_DIR.glob("*.gfx"))
    if not fixtures:
        print(f"[update-goldens] no .gfx fixtures in {GFX_DIR}")
        sys.exit(1)
    for gfx_path in fixtures:
        gfx = autoangel.read_gfx(gfx_path.read_bytes())
        dumped = to_dict(gfx)
        out = gfx_path.with_suffix(".gfx.json")
        out.write_text(json.dumps(dumped, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"[update-goldens] {out.name}  ({len(gfx.elements)} element(s))")


if __name__ == "__main__":
    main()
