import { spawnParticleRuntime } from './particle';
import { spawnContainerRuntime } from './container';
import { spawnDecalRuntime } from './decal';
import { createNoopRuntime } from './noop';
import type { ElementBody } from '../gfx/previews/types';
import type { GfxElement } from '../../../types/autoangel';
import type { GfxElementRuntime, SpawnOpts } from './types';

export function spawnElementRuntime(
  body: ElementBody,
  opts: SpawnOpts,
): GfxElementRuntime {
  switch (body.kind) {
    case 'particle':
      return spawnParticleRuntime(body, opts);
    case 'container':
      return spawnContainerRuntime(body, opts);
    case 'decal':
      return spawnDecalRuntime(body, opts);
    default:
      return createNoopRuntime(opts.three);
  }
}

/**
 * Label describing why an element won't be visible in the model-viewer
 * preview, or `null` if it will render. Drives the GFX tooltip's
 * "not previewed" summary. Keep in sync with `spawnElementRuntime` +
 * per-spawner skip rules.
 */
export function elementSkipReason(element: GfxElement): string | null {
  const body = element.body;
  if (!body) return 'unknown';
  switch (body.kind) {
    case 'particle':
    case 'container':
      return null;
    case 'decal':
      // Type 101 (screen-space) parses but has no runtime — needs an
      // orthographic/HUD pass not in MVP.
      return element.type_id === 101 ? 'decal (screen-space)' : null;
    default:
      return body.kind;
  }
}
