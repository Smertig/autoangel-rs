"""Local dev server for demos (Vite-based).

Usage:
    uv run scripts/serve.py          # Vite dev server with HMR on port 9853
    uv run scripts/serve.py --build  # production build + static serve on port 9853
    uv run scripts/serve.py 8080     # custom port (dev server)
    uv run scripts/serve.py --build 8080  # custom port (build + serve)

The ?local parameter loads WASM from the local autoangel-wasm/pkg build instead of CDN.
"""

import functools
import http.server
import os
import subprocess
import sys
import pathlib

PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEMOS_DIR = PROJECT_ROOT / "demos"


def needs_npm_install() -> bool:
    """Return True if node_modules appears out of date relative to package.json."""
    pkg_json = DEMOS_DIR / "package.json"
    node_modules = DEMOS_DIR / "node_modules"
    if not node_modules.exists():
        return True
    try:
        return pkg_json.stat().st_mtime > node_modules.stat().st_mtime
    except OSError:
        return True


def ensure_npm_install() -> None:
    if needs_npm_install():
        print("Running npm install in demos/...")
        subprocess.run(["npm", "install"], cwd=str(DEMOS_DIR), check=True, shell=(sys.platform == "win32"))
        print("npm install done.")


def copy_local_wasm_pkg(serve_dir: pathlib.Path) -> None:
    """Copy autoangel-wasm/pkg into serve_dir so ?local works in --build mode."""
    import shutil
    wasm_pkg = PROJECT_ROOT / "autoangel-wasm" / "pkg"
    if not wasm_pkg.exists():
        return
    dest = serve_dir / "autoangel-wasm-pkg"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(wasm_pkg, dest)


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # suppress per-request noise


def run_dev_server(port: int) -> None:
    """Start Vite dev server in demos/."""
    ensure_npm_install()
    print(f"Starting Vite dev server on http://localhost:{port}")
    print("  Elements: http://localhost:{}/elements/".format(port))
    print("  PCK:      http://localhost:{}/pck/".format(port))
    print("  Diff:     http://localhost:{}/pck-diff/".format(port))
    print("  Use ?local to load WASM from local build.")
    print("Press Ctrl+C to stop.")
    subprocess.run(
        ["npx", "vite", "--port", str(port)],
        cwd=str(DEMOS_DIR),
        check=False,
        shell=(sys.platform == "win32"),
    )


def run_build_server(port: int) -> None:
    """Build with Vite, then serve demos/dist/ with a no-cache static server."""
    ensure_npm_install()

    print("Building demos with Vite...")
    subprocess.run(
        ["npx", "vite", "build"],
        cwd=str(DEMOS_DIR),
        check=True,
        shell=(sys.platform == "win32"),
    )
    print("Build complete.")

    dist_dir = DEMOS_DIR / "dist"
    copy_local_wasm_pkg(dist_dir)

    handler = functools.partial(NoCacheHandler, directory=str(dist_dir))
    with http.server.HTTPServer(("", port), handler) as httpd:
        print(f"Serving demos/dist/ on http://localhost:{port} (no-cache)")
        print("  Elements: http://localhost:{}/elements/".format(port))
        print("  PCK:      http://localhost:{}/pck/".format(port))
        print("  Diff:     http://localhost:{}/pck-diff/".format(port))
        print("  Use ?local to load WASM from local build.")
        print("Press Ctrl+C to stop.")
        httpd.serve_forever()


if __name__ == "__main__":
    args = sys.argv[1:]
    build_mode = "--build" in args
    args = [a for a in args if a != "--build"]
    port = int(args[0]) if args else 9853

    if build_mode:
        run_build_server(port)
    else:
        run_dev_server(port)
