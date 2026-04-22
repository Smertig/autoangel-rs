import { spawnParticleRuntime } from './particle';
import { createNoopRuntime } from './noop';
import type { ElementBody } from '../gfx/previews/types';
import type { GfxElementRuntime, SpawnOpts } from './types';

export function spawnElementRuntime(
  body: ElementBody,
  opts: SpawnOpts,
): GfxElementRuntime {
  switch (body.kind) {
    case 'particle':
      return spawnParticleRuntime(body, opts);
    default:
      return createNoopRuntime(opts.three);
  }
}
