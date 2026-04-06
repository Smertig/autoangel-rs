"""Local dev server with no-cache headers for WASM development.

Usage:
    uv run docs/serve.py          # serves on port 9853
    uv run docs/serve.py 8080     # custom port
"""

import functools
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9853
    handler = functools.partial(NoCacheHandler, directory=".")
    with http.server.HTTPServer(("", port), handler) as httpd:
        print(f"Serving on http://localhost:{port} (no-cache)")
        httpd.serve_forever()
