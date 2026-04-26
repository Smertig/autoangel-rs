import type { GfxElementRuntime } from './types';

/** Inert runtime for elements with no preview support, kind-filtered out, or
 *  used as a synchronous placeholder. Finishes immediately. */
export function createNoopRuntime(three: any): GfxElementRuntime {
  const root = new three.Group();
  return {
    root,
    tick() {},
    dispose() {},
    finished: () => true,
  };
}
