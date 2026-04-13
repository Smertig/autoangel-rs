const CDN_PKG = 'https://cdn.jsdelivr.net/npm/autoangel@0.10.0';
// Absolute path from Vite root — no junctions/symlinks needed.
// Vite's server.fs.allow includes '..' so this resolves correctly.
const LOCAL_PKG = '/autoangel-wasm-pkg';

export function resolveCDN(): string {
  return new URLSearchParams(location.search).has('local')
    ? LOCAL_PKG
    : CDN_PKG;
}
