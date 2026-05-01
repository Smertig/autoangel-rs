/** Read a CSS custom property off `:root` (or the supplied element). Returns
 *  the trimmed value or the empty string if unset. Safe under SSR — falls
 *  through to the empty string when `window` is absent. */
export function readCssVar(name: string, el?: Element): string {
  if (typeof window === 'undefined') return '';
  const target = el ?? document.documentElement;
  return getComputedStyle(target).getPropertyValue(name).trim();
}

/** Read a CSS custom property and parse it as a `#RRGGBB` hex colour into a
 *  numeric 0xRRGGBB suitable for `THREE.Color`. Falls back to `fallback` when
 *  the variable is unset, malformed, or running under SSR. */
export function readCssColorHex(name: string, fallback: number, el?: Element): number {
  const raw = readCssVar(name, el);
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  return m ? parseInt(m[1], 16) : fallback;
}
