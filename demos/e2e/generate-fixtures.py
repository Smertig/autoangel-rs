# -*- coding: utf-8 -*-
"""Generate test .pck fixtures for E2E tests.

Usage: cd autoangel-py && uv run python ../demos/e2e/generate-fixtures.py
"""
import autoangel
import io
import pathlib
import struct
import sys
import zlib

# Model-fixture generation injects Chinese characters into log output —
# reconfigure stdout so CI runners with ASCII-only codecs don't die on print.
sys.stdout.reconfigure(encoding="utf-8")

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
FIXTURES_DIR = HERE / "fixtures"
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


# --- ECM + GFX particle event fixture (ecm-gfx-particle.spec.ts) ---
# Takes models_npc_animated.pck (which has the NPC with 站立 as the preferred-
# anim-hint default clip) and rewrites its ECM so that clip carries an
# EventType=100 GFX event at StartTime=50 ms. Bundles a real particle GFX
# file under the engine-expected gfx\\ prefix so resolveEnginePath finds it.
def build_ecm_gfx_fixture(
    out_name: str = "ecm_with_gfx_event.pck",
    src_gfx_rel: str = "particle_point.gfx",
    bundled_gfx_name: str = "particle_point.gfx",
) -> None:
    src_pck = REPO / "test_data" / "packages" / "models_npc_animated.pck"
    src_gfx = REPO / "test_data" / "gfx" / src_gfx_rel
    out = FIXTURES_DIR / "models" / out_name
    out.parent.mkdir(parents=True, exist_ok=True)

    # GFX event fields in ECM v66 order — see autoangel-core/src/model/ecm.rs
    # parse_event. Missing any line here breaks the subsequent-action parse.
    gfx_event_block = "\n".join([
        "EventType: 100",
        "StartTime: 50",       # fires 50 ms into the clip
        "TimeSpan: -1",        # no auto-dispose
        "Once: 0",
        "FxFileNum: 1",
        f"FxFilePath: {bundled_gfx_name}",
        "HookName: ",
        "HookOffset: 0.000000, 0.000000, 0.000000",
        "HookYaw: 0.000000",
        "HookPitch: 0.000000",
        "HookRot: 0.000000",
        "BindParent: 1",
        "FadeOut: 1",
        "UseModelAlpha: 0",
        "CustomPath: ",
        "CustomData: ",
        "GfxScale: 0.800000",
        "GfxAlpha: 1.000000",
        "GfxSpeed: 1.000000",
        "GfxOuterPath: ",
        "GfxRelToECM: 0",
        "GfxDelayTime: 0",
        "GfxRotWithModel: 0",
        "GfxParamCount: 0",
    ])

    pkg = autoangel.read_pck(str(src_pck))
    files = pkg.file_list()
    ecm_path = next(f for f in files if f.endswith(".ecm"))
    ecm_bytes = pkg.get_file(ecm_path)
    assert ecm_bytes is not None

    text = ecm_bytes.decode("gbk")
    assert text.count("EventCount: 0") == 1, \
        "Source ECM shape changed — update build_ecm_gfx_fixture"
    modified = text.replace("EventCount: 0", "EventCount: 1\n" + gfx_event_block)
    modified_bytes = modified.encode("gbk")

    # Smoke-test the rewrite before packaging.
    parsed = autoangel.read_ecm(modified_bytes)
    ev = parsed.get_event(0, 0)
    assert ev.event_type == 100
    assert ev.fx_file_path == bundled_gfx_name

    builder = autoangel.PackageBuilder()
    for f in files:
        data = modified_bytes if f == ecm_path else pkg.get_file(f)
        if data is not None:
            builder.add_file(f, data)
    builder.add_file(f"gfx\\{bundled_gfx_name}", src_gfx.read_bytes())
    builder.save(str(out))
    print(f"  {out.name}: {out.stat().st_size} bytes")


build_ecm_gfx_fixture()

# --- ECM + GFX container event fixture (ecm-gfx-container.spec.ts) ---
# Same shape as the particle fixture, but the event's target .gfx is a real
# container_v58.gfx that holds a GfxContainer element (type_id 200) whose
# gfx_path references an asset we intentionally do NOT bundle. The container
# runtime still spawns (sync part of spawnContainerRuntime), proving the
# registry routes type 200 through our new dispatch — the async nested load
# harmlessly no-ops when findFile returns null.
build_ecm_gfx_fixture(
    out_name="ecm_with_gfx_container_event.pck",
    src_gfx_rel="container_v58.gfx",
    bundled_gfx_name="container_v58.gfx",
)

# --- ECM + GFX decal event fixture (ecm-gfx-decal.spec.ts) ---
# Real decal_v58.gfx referenced as the event's target. Decal runtime spawns
# synchronously and animates via the cross/quad mesh. Texture load may or
# may not succeed depending on whether the bundled .gfx references a texture
# we've packaged — either way the spawn proves the registry routes 'decal'
# through spawnDecalRuntime.
build_ecm_gfx_fixture(
    out_name="ecm_with_gfx_decal_event.pck",
    src_gfx_rel="decal_v58.gfx",
    bundled_gfx_name="decal_v58.gfx",
)
