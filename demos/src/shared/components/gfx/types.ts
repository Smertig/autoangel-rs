import type { AutoangelModule } from '../../../types/autoangel';
import type { PackageView } from '@shared/package';

type ParseGfxResult = ReturnType<AutoangelModule['parseGfx']>;
export type GfxElement = ParseGfxResult['elements'][number];
export type ElementBody = GfxElement['body'];
export type ElementBodyKind = ElementBody['kind'];

export interface ViewerCtx {
  path: string;
  ext: string;
  pkg: PackageView;
  wasm: AutoangelModule;
  /** Mirrors `ViewerContext.onNavigateToFile` — undefined when the host
   *  can't host navigation. */
  onNavigateToFile?: (path: string) => void;
}
