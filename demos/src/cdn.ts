const CDN_PKG = 'https://cdn.jsdelivr.net/npm/autoangel@0.9.0';
const LOCAL_PKG = './autoangel-wasm-pkg';

export function resolveCDN(): string {
  return new URLSearchParams(location.search).has('local')
    ? new URL(LOCAL_PKG, location.href).href
    : CDN_PKG;
}
