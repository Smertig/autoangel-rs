import { spawnParticleRuntime } from './particle';
import { spawnContainerRuntime } from './container';
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
  const kind = element.body?.kind ?? 'unknown';
  if (kind !== 'particle' && kind !== 'container') return kind;
  if (kind === 'particle' && !element.tex_file) return 'untextured particle';
  return null;
}
