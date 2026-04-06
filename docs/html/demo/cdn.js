const CDN_PKG = 'https://cdn.jsdelivr.net/npm/autoangel@0.8.4';
const LOCAL_PKG = '../../../../autoangel-wasm/pkg';

export function resolveCDN(importMetaUrl) {
  return new URLSearchParams(location.search).has('local')
    ? new URL(LOCAL_PKG, importMetaUrl).href
    : CDN_PKG;
}
