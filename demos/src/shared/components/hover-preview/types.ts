import type { GetData } from '@shared/formats/types';
import type { AutoangelModule } from '../../../types/autoangel';

export interface HoverCanvasRenderArgs {
  canvas: HTMLCanvasElement;
  path: string;
  data: Uint8Array;
  getData: GetData;
  wasm: AutoangelModule;
  /** Returns true once the popover has unmounted; renderers check between
   *  async steps so resources allocated post-cancel are disposed inline. */
  cancelled: () => boolean;
}

/** Render fn invoked by the hover popover; returns its own cleanup callback. */
export type HoverCanvasRenderer = (args: HoverCanvasRenderArgs) => Promise<() => void>;
