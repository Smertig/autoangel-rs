"""Generate test .pck fixtures for E2E tests.

Usage: cd autoangel-py && uv run python ../demos/e2e/generate-fixtures.py
"""
import autoangel
import io
import pathlib
import struct
import zlib

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"
FIXTURES_DIR.mkdir(exist_ok=True)


def make_png(width: int, height: int, r: int, g: int, b: int) -> bytes:
    """Generate a minimal single-color PNG image."""
    raw_rows = b""
    for _ in range(height):
        raw_rows += b"\x00" + bytes([r, g, b]) * width  # filter byte + RGB pixels

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    buf = io.BytesIO()
    buf.write(b"\x89PNG\r\n\x1a\n")
    buf.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)))
    buf.write(chunk(b"IDAT", zlib.compress(raw_rows)))
    buf.write(chunk(b"IEND", b""))
    return buf.getvalue()


# --- Left package (old) ---
left = autoangel.PackageBuilder()
left.add_file("configs\\game.ini", b"[Settings]\nfps=60\nresolution=1920x1080")
left.add_file("configs\\server.ini", b"[Server]\nhost=localhost\nport=8080")
left.add_file("configs\\removed.ini", b"[Old]\nthis=will be removed")
left.add_file("configs\\unchanged.txt", b"This content stays the same in both packages.")
left.add_file("configs\\binary.dat", b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f")
left.add_file("configs\\icon.png", make_png(4, 4, 255, 0, 0))  # red 4x4
left.add_file("configs\\deleted.png", make_png(2, 2, 0, 0, 255))  # blue 2x2, only in left
left.save(str(FIXTURES_DIR / "left.pck"))

# --- Right package (new) ---
right = autoangel.PackageBuilder()
right.add_file("configs\\game.ini", b"[Settings]\nfps=120\nresolution=2560x1440\nvsync=true")  # modified
right.add_file("configs\\server.ini", b"[Server]\nhost=localhost\nport=8080")  # unchanged
right.add_file("configs\\added.ini", b"[New]\nthis=was added")  # added
right.add_file("configs\\unchanged.txt", b"This content stays the same in both packages.")  # unchanged
right.add_file("configs\\binary.dat", b"\x00\x01\xFF\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f")  # modified (1 byte diff)
right.add_file("configs\\icon.png", make_png(4, 4, 0, 255, 0))  # green 4x4 (modified)
right.add_file("configs\\added.png", make_png(2, 2, 255, 255, 0))  # yellow 2x2, only in right
right.save(str(FIXTURES_DIR / "right.pck"))

print(f"Generated fixtures in {FIXTURES_DIR}")
print(f"  left.pck:  {(FIXTURES_DIR / 'left.pck').stat().st_size} bytes, {len(left.file_list())} files")
print(f"  right.pck: {(FIXTURES_DIR / 'right.pck').stat().st_size} bytes, {len(right.file_list())} files")
# Expected diff:
#   added:     added.ini, added.png
#   deleted:   removed.ini, deleted.png
#   modified:  game.ini, binary.dat, icon.png
#   unchanged: server.ini, unchanged.txt
