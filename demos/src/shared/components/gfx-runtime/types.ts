import type { AutoangelModule } from '../../../types/autoangel';
import type { ElementBody, GfxElement } from '../gfx/previews/types';

export interface GfxElementRuntime {
  readonly root: any; // THREE.Object3D
  tick(deltaSec: number): void;
  dispose(): void;
  /** Returns true when the runtime has no more work to do. Optional. */
  finished?(): boolean;
}

export interface SpawnOpts {
  three: any; // typeof THREE
  gfxScale: number;
  gfxSpeed: number;
  /** Seconds; undefined = infinite. */
  timeSpanSec: number | undefined;
  /** Loads bytes for GFX-referenced assets (textures, nested GFX). */
  getData: (path: string) => Promise<Uint8Array>;
  /** WASM module — needed by texture decode (DDS/TGA/PNG). */
  wasm: AutoangelModule;
  /** Resolves engine-relative paths against loaded packages. Without it,
   *  texture/asset lookups can't find the files and runtimes degrade
   *  (particles render as colored quads, no texture). */
  listFiles?: (prefix: string) => string[];
  /** Parent element — spawners need it for tex_file, src_blend, dest_blend. */
  element: GfxElement;
}

export type GfxElementSpawner<K extends ElementBody['kind']> = (
  body: Extract<ElementBody, { kind: K }>,
  opts: SpawnOpts,
) => GfxElementRuntime;
