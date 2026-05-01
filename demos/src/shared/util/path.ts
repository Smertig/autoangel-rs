/** Canonical JS-side path form: lowercase, forward-slash, no leading
 *  separator. Idempotent. Apply at WASM boundaries (pkg.fileList(),
 *  parser fields holding paths) so all downstream code sees a single
 *  separator convention. PCK file format itself stays backslash-canonical
 *  on the Rust side; WASM `get_file` re-normalizes input internally so
 *  forward-slash queries work. */
export function normalizePath(p: string): string {
  return p.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
}

/** Last path component, including any extension. Empty for root or empty string. */
export function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

/** Directory portion **with trailing slash**, or '' if no separator.
 *  `dirname('a/b/c.dds')` → `'a/b/'`, `dirname('a.dds')` → `''`. */
export function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i + 1);
}
