import glob
import os
from pathlib import Path

import autoangel


def dump(package: autoangel.PckPackage, out):
    paths = package.file_list()
    entries = []
    package.scan_entries(paths=paths, on_chunk=entries.extend, interval_ms=0)

    out.write(f'{len(entries)} files:\n')
    for e in entries:
        out.write(f'  {e.path} (size={e.size}, compressed={e.compressed_size}, hash=0x{e.hash:08X})\n')


def test_dump_packages():
    errors_num = 0

    for path in glob.glob("../test_data/packages/*.pck"):
        try:
            pkg = autoangel.read_pck(path)
            gold_path = Path(f'{path}.txt')
            tmp_path = Path(f'{path}.tmp.txt')

            with open(tmp_path, 'w', encoding='utf8') as f:
                dump(pkg, f)

            if not gold_path.exists() or gold_path.read_text(encoding='utf8') != tmp_path.read_text(encoding='utf8'):
                errors_num += 1
            else:
                tmp_path.unlink()
        except Exception as e:
            raise RuntimeError(f"can't test {path} (size={os.path.getsize(path)}): {e}")

    if errors_num > 0:
        raise RuntimeError(f'{errors_num} error(s) in dump test')
