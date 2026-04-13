import type { ComponentType } from 'react';
import type { AutoangelModule } from '../../types/autoangel';

export interface ViewerContext {
  path: string;
  ext: string;
  getData: (path: string) => Promise<Uint8Array>;
  wasm: AutoangelModule;
  listFiles?: (prefix: string) => string[];
}

// Currently pre-loads both sides because we can't compute hashes of
// uncompressed data without decompressing. If we gain that ability,
// we can switch to lazy getData callbacks and let formats load on demand.
export interface DifferContext {
  path: string;
  ext: string;
  leftData: Uint8Array;
  rightData: Uint8Array;
  wasm: AutoangelModule;
}

export interface FormatDescriptor {
  name: string;
  matches(ext: string): boolean;
  Viewer: ComponentType<ViewerContext>;
  Differ: ComponentType<DifferContext>;
}
