import type { ComponentType } from 'react';
import type { AutoangelModule } from '../../types/autoangel';
import type { FindFile } from '@shared/components/gfx/util/resolveEnginePath';

/**
 * Two-scope persisted state ports a viewer can plug into. Both blobs are
 * format-owned; the host treats them as opaque (defaults to `unknown`).
 * The model-viewer chain instantiates this with its concrete schemas.
 *
 * Any port may be undefined — formats gate emission/restoration on presence
 * (e.g. diff view and GFX-event-embedded previews pass none, so they don't
 * pollute the host's persistence).
 */
export interface StatePorts<E = unknown, F = unknown> {
  /** Per-file state from a prior visit (e.g. ECM/SMD: clip, paused, scrub pos). */
  initialEntryState?: E;
  /** Per-format session state (e.g. ECM/SMD: speed, loop mode). */
  initialFormatState?: F;
  /** Pass the **full** current per-file state — not partials. */
  onEntryStateChange?: (state: E) => void;
  /** Pass the **full** current per-format session state. */
  onFormatStateChange?: (state: F) => void;
}

export interface ViewerContext {
  path: string;
  ext: string;
  getData: (path: string) => Promise<Uint8Array>;
  wasm: AutoangelModule;
  listFiles: (prefix: string) => string[];
  findFile: FindFile;
  /** Navigate the shell to another file already resolvable via `findFile`.
   *  Undefined when the host can't host navigation (diff view, single-file
   *  preview) — consumers gate affordances on this. */
  onNavigateToFile?: (path: string) => void;
  /**
   * Persisted state ports — bundled because the four fields always travel
   * together (you opt in or out as a unit). Undefined when the host can't
   * persist (diff view, GFX-event embed, single-file preview).
   */
  state?: StatePorts;
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

export interface DownloadAction {
  label: string;
  onClick: () => Promise<void>;
}

/** Slimmer than ViewerContext: hover previews are read-only, single-file,
 *  no navigation, no persisted state. The wrapper owns fetch + cancellation,
 *  so the format receives bytes already loaded. */
export interface HoverContext {
  path: string;
  ext: string;
  data: Uint8Array;
  wasm: AutoangelModule;
}

export interface FormatDescriptor {
  name: string;
  matches(ext: string): boolean;
  Viewer: ComponentType<ViewerContext>;
  Differ: ComponentType<DifferContext>;
  HoverPreview?: ComponentType<HoverContext>;
  downloadActions?: (ctx: ViewerContext) => DownloadAction[] | undefined;
}
