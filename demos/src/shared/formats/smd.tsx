import { SmdViewer, bridgeModelStatePorts } from '@shared/components/model-viewer';
import { renderSmdHoverPreview } from '@shared/components/model-viewer/internal/render-smd-hover';
import { HoverCanvasPreview } from '@shared/components/hover-preview/HoverCanvasPreview';
import { sideBySideDiffer } from './helpers';
import type { FormatDescriptor, HoverContext, ViewerContext } from './types';

function SmdFormatViewer({ path, pkg, wasm, state }: ViewerContext) {
  return (
    <SmdViewer
      path={path}
      wasm={wasm}
      pkg={pkg}
      state={bridgeModelStatePorts(state)}
    />
  );
}

function SmdHoverPreview(ctx: HoverContext) {
  return (
    <HoverCanvasPreview
      path={ctx.path} data={ctx.data} pkg={ctx.pkg} wasm={ctx.wasm}
      render={renderSmdHoverPreview}
      label="SMD" width={280} height={280}
    />
  );
}

export const smdFormat: FormatDescriptor = {
  name: 'smd',
  matches: (ext) => ext === '.smd',
  Viewer: SmdFormatViewer,
  Differ: sideBySideDiffer(SmdFormatViewer),
  HoverPreview: SmdHoverPreview,
};
