import { blendPresetName, d3dBlendToThreeFactor } from '../../util/blendModes';

/**
 * Build three.js material blending props from a D3D (src, dst) pair.
 *
 * For canonical presets — additive, alpha, premultiplied — we return the
 * matching three.js preset constant. The presets wire up
 * blendSrcAlpha/blendDstAlpha/blendEquation correctly for transparent
 * MeshBasicMaterial; a bare CustomBlending + blendSrc/blendDst only
 * doesn't render "additive" the way D3D means it (the DDS black
 * background shows through the quad as opaque).
 *
 * Unknown factors fall back to NormalBlending.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decalBlendingProps(srcBlend: number, dstBlend: number, THREE: any): {
  blending: number;
  blendSrc?: number;
  blendDst?: number;
  blendEquation?: number;
} {
  const preset = blendPresetName(srcBlend, dstBlend);
  if (preset === 'additive' || preset === 'additive (no alpha)') return { blending: THREE.AdditiveBlending };
  if (preset === 'alpha') return { blending: THREE.NormalBlending };
  if (preset === 'premultiplied') {
    return {
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    };
  }
  const srcFactor = d3dBlendToThreeFactor(srcBlend, THREE);
  const dstFactor = d3dBlendToThreeFactor(dstBlend, THREE);
  if (srcFactor === null || dstFactor === null) return { blending: THREE.NormalBlending };
  return {
    blending: THREE.CustomBlending,
    blendSrc: srcFactor,
    blendDst: dstFactor,
    blendEquation: THREE.AddEquation,
  };
}
