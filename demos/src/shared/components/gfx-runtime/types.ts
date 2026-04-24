import type { AutoangelModule } from '../../../types/autoangel';
import type { ElementBody, GfxElement } from '../gfx/previews/types';
import type { FindFile } from '../gfx/util/resolveEnginePath';
import type { GfxLoader } from './loader';

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
  /** O(1) full-path existence check; returns canonical-cased stored path or null. */
  findFile: FindFile;
  /** Parent element — spawners need it for tex_file, src_blend, dest_blend. */
  element: GfxElement;
  /** Lazy loader for GFX referenced by `Container` elements. */
  loader: GfxLoader;
  /** Cycle guard — set of already-visited resolved paths; threaded through
   *  recursive container spawns. Undefined at top-level (fresh recursion). */
  visiting?: Set<string>;
}

export type GfxElementSpawner<K extends ElementBody['kind']> = (
  body: Extract<ElementBody, { kind: K }>,
  opts: SpawnOpts,
) => GfxElementRuntime;
