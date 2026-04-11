"""Generate test .pck fixtures for E2E tests.

Usage: cd autoangel-py && uv run python ../demos/e2e/generate-fixtures.py
"""
import autoangel
import pathlib

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"
FIXTURES_DIR.mkdir(exist_ok=True)

# --- Left package (old) ---
left = autoangel.PackageBuilder()
left.add_file("configs\\game.ini", b"[Settings]\nfps=60\nresolution=1920x1080")
left.add_file("configs\\server.ini", b"[Server]\nhost=localhost\nport=8080")
left.add_file("configs\\removed.ini", b"[Old]\nthis=will be removed")
left.add_file("configs\\unchanged.txt", b"This content stays the same in both packages.")
left.add_file("configs\\binary.dat", b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f")
left.save(str(FIXTURES_DIR / "left.pck"))

# --- Right package (new) ---
right = autoangel.PackageBuilder()
right.add_file("configs\\game.ini", b"[Settings]\nfps=120\nresolution=2560x1440\nvsync=true")  # modified
right.add_file("configs\\server.ini", b"[Server]\nhost=localhost\nport=8080")  # unchanged
right.add_file("configs\\added.ini", b"[New]\nthis=was added")  # added
right.add_file("configs\\unchanged.txt", b"This content stays the same in both packages.")  # unchanged
right.add_file("configs\\binary.dat", b"\x00\x01\xFF\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f")  # modified (1 byte diff)
right.save(str(FIXTURES_DIR / "right.pck"))

print(f"Generated fixtures in {FIXTURES_DIR}")
print(f"  left.pck:  {(FIXTURES_DIR / 'left.pck').stat().st_size} bytes, {len(left.file_list())} files")
print(f"  right.pck: {(FIXTURES_DIR / 'right.pck').stat().st_size} bytes, {len(right.file_list())} files")
# Expected diff: 1 added (added.ini), 1 deleted (removed.ini), 2 modified (game.ini, binary.dat), 2 unchanged (server.ini, unchanged.txt)
