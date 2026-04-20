import type { AutoangelModule } from '../../../../types/autoangel';

type ParseGfxResult = ReturnType<AutoangelModule['parseGfx']>;
export type GfxElement = ParseGfxResult['elements'][number];
export type ElementBody = GfxElement['body'];
export type ElementBodyKind = ElementBody['kind'];

export interface ViewerCtx {
  path: string;
  ext: string;
  getData: (path: string) => Promise<Uint8Array>;
  listFiles?: (prefix: string) => string[];
  wasm: AutoangelModule;
}

export interface PreviewProps<K extends ElementBodyKind = ElementBodyKind> {
  body: Extract<ElementBody, { kind: K }>;
  element: GfxElement;
  context: ViewerCtx;
  expanded: boolean;
}
