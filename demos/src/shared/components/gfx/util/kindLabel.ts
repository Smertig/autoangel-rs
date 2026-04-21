import type { GfxElement, ElementBodyKind } from '../previews/types';

const BASE_LABELS: Record<ElementBodyKind, string> = {
  particle: 'PARTICLE',
  decal: 'DECAL',
  trail: 'TRAIL',
  light: 'LIGHT',
  ring: 'RING',
  model: 'MODEL',
  container: 'CONTAINER',
  grid_decal_3d: 'GRID DECAL 3D',
  lightning: 'LIGHTNING',
  lightning_ex: 'LIGHTNING EX',
  ltn_bolt: 'LTN BOLT',
  sound: 'SOUND',
  unknown: 'UNKNOWN',
};

/** Subtype-aware badge label; falls back to the kind tag for single-subtype kinds. */
export function formatKindBadge(element: GfxElement): string {
  if (element.body.kind === 'decal') {
    switch (element.type_id) {
      case 100: return 'DECAL 3D';
      case 101: return 'DECAL 2D';
      case 102: return 'DECAL BB';
    }
  }
  return BASE_LABELS[element.body.kind];
}
