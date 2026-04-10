"""Local dev server with no-cache headers for WASM development.

Assembles docs/ + demos/ into a temporary site matching the deployed layout:
  /              <- docs/ contents (index.html, autoangel.html)
  /demo/         <- demos/ contents

Usage:
    uv run scripts/serve.py          # serves on port 9853
    uv run scripts/serve.py 8080     # custom port
"""

import functools
import http.server
import os
import sys
import tempfile
import pathlib

from assemble_site import assemble_site


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9853
    project_root = pathlib.Path(__file__).resolve().parent.parent

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmpdir:
        site_dir = pathlib.Path(tmpdir) / "site"
        assemble_site(site_dir)

        # Symlink autoangel-wasm/pkg so ?local still works
        wasm_pkg = project_root / "autoangel-wasm" / "pkg"
        if wasm_pkg.exists():
            link = site_dir / "demo" / "autoangel-wasm-pkg"
            if sys.platform == "win32":
                import _winapi
                _winapi.CreateJunction(str(wasm_pkg), str(link))
            else:
                os.symlink(wasm_pkg, link)

        handler = functools.partial(NoCacheHandler, directory=str(site_dir))
        with http.server.HTTPServer(("", port), handler) as httpd:
            print(f"Serving on http://localhost:{port} (no-cache)")
            print(f"  Docs:  http://localhost:{port}/")
            print(f"  Demos: http://localhost:{port}/demo/")
            httpd.serve_forever()
