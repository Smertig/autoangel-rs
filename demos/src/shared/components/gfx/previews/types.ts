import type { AutoangelModule } from '../../../../types/autoangel';
import type { FindFile } from '../util/resolveEnginePath';

type ParseGfxResult = ReturnType<AutoangelModule['parseGfx']>;
export type GfxElement = ParseGfxResult['elements'][number];
export type ElementBody = GfxElement['body'];
export type ElementBodyKind = ElementBody['kind'];

export interface ViewerCtx {
  path: string;
  ext: string;
  getData: (path: string) => Promise<Uint8Array>;
  listFiles: (prefix: string) => string[];
  findFile: FindFile;
  wasm: AutoangelModule;
  /** Mirrors `ViewerContext.onNavigateToFile` — undefined when the host
   *  can't host navigation. */
  onNavigateToFile?: (path: string) => void;
}
