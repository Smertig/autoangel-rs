// D3DBLEND enum (from Direct3D 9). Engine's element header stores `src_blend`
// and `dest_blend` as these integer values; we need labels for the typed-field
// panel and factor mappings for the three.js RawShaderMaterial.

const D3DBLEND_LABEL: Record<number, string> = {
  1: 'Zero',
  2: 'One',
  3: 'SrcColor',
  4: 'InvSrcColor',
  5: 'SrcAlpha',
  6: 'InvSrcAlpha',
  7: 'DstAlpha',
  8: 'InvDstAlpha',
  9: 'DstColor',
  10: 'InvDstColor',
};

export function d3dBlendLabel(v: number): string {
  return D3DBLEND_LABEL[v] ?? `?${v}`;
}

/**
 * Detect common named blend-mode presets so the field panel can show
 * something like `SrcAlpha / One  (additive)` instead of the raw
 * two-factor string.
 */
export function blendPresetName(src: number, dst: number): string | null {
  if (src === 5 && dst === 6) return 'alpha';
  if (src === 5 && dst === 2) return 'additive';
  if (src === 2 && dst === 2) return 'additive (no alpha)';
  if (src === 1 && dst === 6) return 'premultiplied';
  return null;
}

export function formatBlendMode(src: number, dst: number): string {
  const base = `${d3dBlendLabel(src)} / ${d3dBlendLabel(dst)}`;
  const preset = blendPresetName(src, dst);
  return preset ? `${base}  (${preset})` : base;
}

/**
 * Translate a D3DBLEND enum value to a three.js blend factor constant.
 * THREE is threaded through as `any` so this module stays side-effect-free
 * and doesn't force a three.js import on code paths that only need labels
 * (tests, field panel).
 */
export function d3dBlendToThreeFactor(v: number, THREE: any): number | null {
  const map: Record<number, number> = {
    1: THREE.ZeroFactor,
    2: THREE.OneFactor,
    3: THREE.SrcColorFactor,
    4: THREE.OneMinusSrcColorFactor,
    5: THREE.SrcAlphaFactor,
    6: THREE.OneMinusSrcAlphaFactor,
    7: THREE.DstAlphaFactor,
    8: THREE.OneMinusDstAlphaFactor,
    9: THREE.DstColorFactor,
    10: THREE.OneMinusDstColorFactor,
  };
  return map[v] ?? null;
}
