# /// script
# requires-python = ">=3.14"
# dependencies = [
#     "pdoc>=15.0",
#     "maturin>=1.7,<2.0",
# ]
# ///

import pathlib
import os
import sys

PROJECT_DIR = pathlib.Path(__file__).parent.parent

os.chdir(PROJECT_DIR / "autoangel-py")

assert os.system("maturin develop") == 0, "unable to rebuild autoangel"

# Ensure autoangel.pyi is discoverable by pdoc (PEP 561 stub discovery)
sys.path.insert(0, str(PROJECT_DIR / "autoangel-py"))

import autoangel
import pdoc
import pdoc.doc
import pdoc.render

pdoc.render.configure(docformat='google')

doc = pdoc.doc.Module(autoangel)

# Hide internal __build__ dict from docs
if "__build__" in doc.members:
    del doc.members["__build__"]

# Sort members for deterministic output across platforms
doc.members = dict(sorted(doc.members.items()))
for member in doc.members.values():
    if hasattr(member, "members"):
        member.members = dict(sorted(member.members.items()))

all_modules = {"autoangel": doc}
html = pdoc.render.html_module(module=doc, all_modules=all_modules)

output_path = PROJECT_DIR / 'docs' / 'autoangel.html'
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(html, encoding='utf-8', newline='\n')
