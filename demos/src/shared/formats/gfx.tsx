import { GfxViewer } from '@shared/components/gfx';
import { renderGfxHoverPreview } from '@shared/components/gfx/render-hover';
import { HoverCanvasPreview } from '@shared/components/hover-preview/HoverCanvasPreview';
import { sideBySideDiffer } from './helpers';
import { useFileData } from '@shared/hooks/useFileData';
import type { FormatDescriptor, HoverContext, ViewerContext } from './types';

function GfxFormatViewer(ctx: ViewerContext) {
  const state = useFileData(ctx.path, ctx.getData);
  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.message}</div>;
  return <GfxViewer data={state.data} context={ctx} />;
}

function GfxHoverPreview(ctx: HoverContext) {
  return (
    <HoverCanvasPreview
      data={ctx.data} getData={ctx.getData} wasm={ctx.wasm}
      render={renderGfxHoverPreview}
      label="GFX" width={300} height={296}
    />
  );
}

export const gfxFormat: FormatDescriptor = {
  name: 'gfx',
  matches: (ext) => ext === '.gfx',
  Viewer: GfxFormatViewer,
  Differ: sideBySideDiffer(GfxFormatViewer),
  HoverPreview: GfxHoverPreview,
};
