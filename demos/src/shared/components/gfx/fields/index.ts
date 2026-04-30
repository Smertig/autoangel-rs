import type { FieldRow } from '../fieldPanel';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';
import { buildParticleRows } from './particle';
import { buildDecalRows } from './decal';
import { buildGridDecalRows } from './grid-decal';
import { buildLightRows } from './light';
import { buildModelRows } from './model';
import { buildContainerRows } from './container';
import { buildDefaultRows } from './default';

export function buildFieldRowsFor(
  body: ElementBody,
  element: GfxElement,
  ctx: ViewerCtx,
): FieldRow[] {
  switch (body.kind) {
    case 'particle':      return buildParticleRows(body, element, ctx);
    case 'decal':         return buildDecalRows(body, element, ctx);
    case 'grid_decal_3d': return buildGridDecalRows(body, element, ctx);
    case 'light':         return buildLightRows(body, element, ctx);
    case 'model':         return buildModelRows(body, element, ctx);
    case 'container':     return buildContainerRows(body, element, ctx);
    default:              return buildDefaultRows(body, element, ctx);
  }
}
