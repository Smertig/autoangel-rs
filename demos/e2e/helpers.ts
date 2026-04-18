// Mode-aware URL helper for E2E specs.
//
// Default ("pinned" mode, E2E_MODE unset): tests hit pages without
// the `?local` query param, so the demo's `resolveCDN()` picks the
// CDN URL for the autoangel version pinned in `demos/package.json`.
// The pinned mode is what CI runs — `tsconfig.published.json` resolves
// `'autoangel'` types via `node_modules`, and playwright navigates to
// the CDN-served wasm.
//
// `E2E_MODE=local` ("local" mode): appends `?local` so `resolveCDN()`
// picks the locally-built `autoangel-wasm/pkg` served by Vite. Used
// via `npm run test:e2e:local`, which first asserts the demos pin
// matches the workspace version.
export function gotoPath(path: string): string {
  if (process.env.E2E_MODE !== 'local') return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}local`;
}
