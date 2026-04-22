import type { GfxElementRuntime } from './types';

export function createNoopRuntime(three: any): GfxElementRuntime {
  const root = new three.Group();
  return {
    root,
    tick() {},
    dispose() {},
  };
}
