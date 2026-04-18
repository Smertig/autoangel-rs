# /// script
# requires-python = ">=3.10"
# dependencies = ["autoangel"]
#
# [tool.uv.sources]
# autoangel = { path = "../autoangel-py" }
# ///
"""Survey a gfx.pck archive: parse each .gfx, report parse rate, element-type
frequency, version distribution, and a body-variant dispatch cross-tab
(flags typed-parser regressions that silently fall back to Unknown).

Usage:
  uv run scripts/gfx_survey.py path/to/gfx.pck
"""
import re
import sys
from collections import Counter
import autoangel

ELEMENT_TYPE_NAMES = {
    100: "Decal3D", 101: "Decal2D", 102: "DecalBillboard",
    110: "Trail",
    120: "ParticlePoint", 121: "ParticleBox", 122: "ParticleMultiplane",
    123: "ParticleEllipsoid", 124: "ParticleCylinder", 125: "ParticleCurve",
    130: "Light", 140: "Ring",
    150: "Lightning", 151: "LtnBolt", 152: "LightningEx",
    160: "Model", 170: "Sound", 180: "LtnTrail", 190: "Paraboloid",
    200: "GfxContainer",
    210: "GridDecal3D", 211: "GridDecal2D",
    220: "PhysEmitter", 221: "PhysPointEmitter",
    230: "EcModel", 240: "Ribbon",
}

def name_for(tid: int) -> str:
    return ELEMENT_TYPE_NAMES.get(tid, f"Unknown({tid})")

def main(pck_path: str) -> None:
    print(f"[survey] opening {pck_path}")
    pkg = autoangel.read_pck(pck_path)
    files = pkg.file_list()
    print(f"[survey] total entries: {len(files)}")

    gfx_paths = [p for p in files if p.lower().endswith(".gfx")]
    print(f"[survey] .gfx files: {len(gfx_paths)}")

    versions = Counter()
    type_counts = Counter()
    file_uses_type = Counter()
    parse_ok = 0
    parse_fail = 0
    fail_samples: list[tuple[str, str]] = []
    element_count_hist: list[int] = []
    fail_kinds: Counter = Counter()
    # (type_id, body_kind) pair frequency — reveals typed-variant fallbacks.
    type_body_kind: Counter = Counter()
    # Example .gfx path per (type_id, body_kind) for debugging fallbacks.
    fallback_examples: dict[tuple[int, str], str] = {}

    for idx, path in enumerate(gfx_paths):
        if idx % 2000 == 0:
            print(f"[survey]   progress: {idx}/{len(gfx_paths)}")
        data = pkg.get_file(path)
        if data is None:
            parse_fail += 1
            if len(fail_samples) < 10:
                fail_samples.append((path, "get_file returned None"))
            continue
        try:
            gfx = autoangel.read_gfx(data)
        except Exception as e:
            parse_fail += 1
            msg = str(e)
            # Bucket by (expected, got) key pair — keep only the key names so
            # version/path-specific tails don't fragment the histogram.
            m = re.match(r"Expected '([^']*)', got '([^']*)'", msg)
            if m:
                expected = m.group(1)
                got_key = re.split(r"[:\s]", m.group(2), maxsplit=1)[0] + ":"
                key = f"Expected {expected}, got {got_key}"
            else:
                key = re.sub(r"\s*at line \d+.*$", "", msg)
            fail_kinds[key] += 1
            if len(fail_samples) < 10:
                fail_samples.append((path, f"parse error: {e}"))
            continue

        parse_ok += 1
        versions[gfx.version] += 1
        ec = gfx.element_count
        element_count_hist.append(ec)
        seen_in_file = set()
        for k in range(ec):
            t = gfx.element_type(k)
            type_counts[t] += 1
            seen_in_file.add(t)
            kind = gfx.element_body_kind(k)
            type_body_kind[(t, kind)] += 1
            fallback_examples.setdefault((t, kind), path)
        for t in seen_in_file:
            file_uses_type[t] += 1

    print()
    print("=== Parse results ===")
    print(f"  ok:   {parse_ok}")
    print(f"  fail: {parse_fail}")
    print()
    print("=== Failure kinds (normalized) ===")
    for k, c in fail_kinds.most_common(30):
        pct = 100.0 * c / max(1, parse_fail)
        print(f"  {c:>5}  ({pct:5.1f}%)  {k}")
    if fail_samples:
        print()
        print("  failure samples (first 10):")
        for n, err in fail_samples:
            print(f"    - {n}: {err}")

    print()
    print("=== Version distribution ===")
    for v, c in sorted(versions.items()):
        pct = 100.0 * c / max(1, parse_ok)
        print(f"  v{v:>3}: {c:>6}  ({pct:5.1f}%)")

    print()
    print("=== Element type: total occurrences ===")
    total_elems = sum(type_counts.values())
    for t, c in sorted(type_counts.items(), key=lambda kv: -kv[1]):
        pct = 100.0 * c / max(1, total_elems)
        print(f"  {t:>3} {name_for(t):<22} {c:>8}  ({pct:5.2f}%)")

    print()
    print("=== Element type: files that use it at least once ===")
    for t, c in sorted(file_uses_type.items(), key=lambda kv: -kv[1]):
        pct = 100.0 * c / max(1, parse_ok)
        print(f"  {t:>3} {name_for(t):<22} {c:>8}  ({pct:5.2f}% of files)")

    # Element-type ↔ body-variant cross-tab. For types that have a typed
    # parser, any "unknown" rows mean the parser fell back to raw lines —
    # either empty-body files (legitimate) or a schema drift we missed.
    expected_kind = {
        100: "decal", 101: "decal", 102: "decal",
        110: "trail",
        130: "light",
        140: "ring",
        160: "model",
        200: "container",
    }
    print()
    print("=== Body variant dispatch cross-tab ===")
    seen_types = sorted({t for (t, _) in type_body_kind})
    for t in seen_types:
        exp = expected_kind.get(t)
        for (tk, kind), n in sorted(type_body_kind.items()):
            if tk != t:
                continue
            total = type_counts[t]
            share = 100.0 * n / max(1, total)
            marker = ""
            if exp is not None and kind != exp:
                marker = "  <-- FALLBACK"
            ex = fallback_examples.get((t, kind), "")
            print(f"  {t:>3} {name_for(t):<22} {kind:<10} {n:>7}  ({share:5.1f}%){marker}")
            if marker:
                print(f"      example: {ex}")

    print()
    if element_count_hist:
        element_count_hist.sort()
        n = len(element_count_hist)
        def pct(p: float) -> int:
            i = min(n - 1, int(p * n))
            return element_count_hist[i]
        print("=== Elements-per-file distribution ===")
        print(f"  min={element_count_hist[0]}  max={element_count_hist[-1]}  mean={sum(element_count_hist)/n:.1f}")
        print(f"  p50={pct(0.5)}  p90={pct(0.9)}  p99={pct(0.99)}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: gfx_survey.py <path-to-gfx.pck>")
        sys.exit(1)
    main(sys.argv[1])
