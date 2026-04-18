# /// script
# requires-python = ">=3.14"
# dependencies = [
#     # Pinned to ravenexp's fix for pdoc#868 — upstream pdoc 16.0.0 enters
#     # infinite recursion when documenting PyO3 >=0.28 complex enums
#     # (variants appear on every sibling via inheritance, and pdoc has no
#     # visited-set guard). Swap back to `pdoc>=16.x` once PR #869 merges.
#     "pdoc @ git+https://github.com/ravenexp/pdoc@5604670c08b14ad7fc117dcbb23f664ef6a5a5bc",
#     "maturin>=1.7,<2.0",
# ]
# ///

import pathlib
import os
import sys
from functools import cached_property

PROJECT_DIR = pathlib.Path(__file__).parent.parent

os.chdir(PROJECT_DIR / "autoangel-py")

assert os.system("maturin develop") == 0, "unable to rebuild autoangel"

# Ensure autoangel.pyi is discoverable by pdoc (PEP 561 stub discovery)
sys.path.insert(0, str(PROJECT_DIR / "autoangel-py"))

import autoangel
import pdoc
import pdoc.doc
import pdoc.render

# Sort members alphabetically. PyO3 exposes class attributes in a
# non-deterministic order (varies per platform / invocation), which
# would otherwise make `docs/autoangel.html` regenerate with a different
# diff every time and break `check_docs.yml` on CI.
_orig_members = pdoc.doc.Namespace.__dict__["members"].func
_sorted_members = cached_property(
    lambda self: dict(sorted(_orig_members(self).items()))
)
_sorted_members.__set_name__(pdoc.doc.Namespace, "members")
pdoc.doc.Namespace.members = _sorted_members  # type: ignore[assignment]

pdoc.render.configure(docformat='google')

doc = pdoc.doc.Module(autoangel)

# Hide internal __build__ dict from docs
if "__build__" in doc.members:
    del doc.members["__build__"]

all_modules = {"autoangel": doc}
html = pdoc.render.html_module(module=doc, all_modules=all_modules)

# Hide class members (fields / methods) from the left-panel TOC — keep
# only top-level class entries. Clicking a class still scrolls to its
# doc section where all members are rendered in full.
html = html.replace(
    "</head>",
    "<style>nav.pdoc ul.memberlist ul.memberlist { display: none; }</style></head>",
    1,
)

output_path = PROJECT_DIR / 'docs' / 'autoangel.html'
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(html, encoding='utf-8', newline='\n')
