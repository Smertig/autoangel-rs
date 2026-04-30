import type { ElementBody, GfxElement } from '../gfx/types';
import type { PackageView } from '@shared/package';

export interface GfxElementRuntime {
  readonly root: any; // THREE.Object3D
  tick(deltaSec: number): void;
  dispose(): void;
  /** Returns true when the runtime has no more work to do. Optional. */
  finished?(): boolean;
}

/** Decoded texture handed off to a runtime. THREE.Texture has a `dispose`
 *  but its lifecycle is the caller's; runtimes never call it. */
export type PreloadedTexture = { dispose?: () => void } & object;

export interface SpawnOpts {
  three: any; // typeof THREE
  gfxScale: number;
  gfxSpeed: number;
  /** Seconds; undefined = infinite. */
  timeSpanSec: number | undefined;
  /** File-access port — spawners use `pkg.resolveEngine` for engine-relative
   *  paths and `pkg.resolve` for already-canonical paths. */
  pkg: PackageView;
  /** Parent element — spawners need it for tex_file, src_blend, dest_blend. */
  element: GfxElement;
  /** Cycle guard — set of already-visited resolved paths; threaded through
   *  recursive container spawns. Undefined at top-level (fresh recursion). */
  visiting?: Set<string>;
  /** Per-kind enable filter for the model-viewer "Render GFX" picker.
   *  Returning false noops the spawn (top-level AND nested recursions, so
   *  disabling 'container' also skips its children). Undefined = no filter. */
  kindFilter?: (kind: ElementBody['kind']) => boolean;
  /** Pre-fetched parsed nested GFX files keyed by resolved path. */
  preloadedGfx?: Map<string, unknown>;
  /** Pre-decoded textures keyed by resolved texture path. The cache outlives
   *  every runtime; meshes do not dispose these. */
  preloadedTextures?: Map<string, PreloadedTexture>;
  /** Camera for view-aligned rendering (rot_from_view). Optional —
   *  spawners that don't need it ignore it; grid-decal silently falls back to
   *  default local-space mode when null. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  camera?: any; // THREE.Camera
}

export type GfxElementSpawner<K extends ElementBody['kind']> = (
  body: Extract<ElementBody, { kind: K }>,
  opts: SpawnOpts,
) => GfxElementRuntime;
