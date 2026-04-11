import glob
import os
from pathlib import Path

from autoangel import *


def dump(data: ElementsData, out):
    out.write(f'version = {data.version}, {len(data)} lists:\n')

    for l in data:
        out.write(f'  {l.config.caption} ({len(l)} entries)\n')
        for i, entry in enumerate(l):
            out.write(f'    [{i}] {entry}\n')


def test_dump_elements():
    errors_num = 0

    for path in glob.glob("../test_data/elements/*.data"):
        try:
            el = read_elements(path)
            gold_path = Path(f'{path}.txt')
            tmp_path = Path(f'{path}.tmp.txt')

            with open(tmp_path, 'w', encoding='utf8') as f:
                dump(el, f)

            if not gold_path.exists() or gold_path.read_text(encoding='utf8') != tmp_path.read_text(encoding='utf8'):
                errors_num += 1
            else:
                tmp_path.unlink()
        except Exception as e:
            raise RuntimeError(f'can\'t test {path} (size={os.path.getsize(path)}): {e}')

    if errors_num > 0:
        raise RuntimeError(f'{errors_num} error(s) in dump test')
