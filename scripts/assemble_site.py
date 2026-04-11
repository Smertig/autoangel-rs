"""Assemble docs/ + demos/ into a deployment-ready site directory.

Builds the demos with Vite first, then copies docs/ and demos/dist/ to dest.

Usage: python scripts/assemble_site.py <dest_dir>
"""

import shutil
import subprocess
import sys
from pathlib import Path

_DOCS_FILES = ["index.html", "autoangel.html"]

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEMOS_DIR = PROJECT_ROOT / "demos"


def assemble_site(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)

    # Build demos
    print("Building demos (npm ci && npx vite build)...")
    subprocess.run(
        ["npm", "ci"],
        cwd=str(DEMOS_DIR),
        check=True,
        shell=(sys.platform == "win32"),
    )
    subprocess.run(
        ["npx", "vite", "build"],
        cwd=str(DEMOS_DIR),
        check=True,
        shell=(sys.platform == "win32"),
    )

    # Copy docs
    for name in _DOCS_FILES:
        shutil.copy2(PROJECT_ROOT / "docs" / name, dest / name)

    # Copy built demos
    shutil.copytree(DEMOS_DIR / "dist", dest / "demo")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <dest_dir>", file=sys.stderr)
        sys.exit(1)
    assemble_site(Path(sys.argv[1]))
