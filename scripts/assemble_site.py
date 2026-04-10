"""Assemble docs/ + demos/ into a deployment-ready site directory.

Usage: python scripts/assemble_site.py <dest_dir>
"""

import shutil
import sys
from pathlib import Path

_DOCS_FILES = ["index.html", "autoangel.html"]

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def assemble_site(dest):
    dest.mkdir(parents=True, exist_ok=True)
    for name in _DOCS_FILES:
        shutil.copy2(PROJECT_ROOT / "docs" / name, dest / name)
    shutil.copytree(PROJECT_ROOT / "demos", dest / "demo")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <dest_dir>", file=sys.stderr)
        sys.exit(1)
    assemble_site(Path(sys.argv[1]))
