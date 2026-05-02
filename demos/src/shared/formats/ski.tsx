import { SkiViewer } from '@shared/components/model-viewer';
import { renderSkiHoverPreview } from '@shared/components/model-viewer/internal/render-ski-hover';
import { HoverCanvasPreview } from '@shared/components/hover-preview/HoverCanvasPreview';
import { sideBySideDiffer } from './helpers';
import type { FormatDescriptor, HoverContext, ViewerContext } from './types';

function SkiFormatViewer({ path, pkg, wasm }: ViewerContext) {
  return <SkiViewer path={path} wasm={wasm} pkg={pkg} />;
}

function SkiHoverPreview(ctx: HoverContext) {
  return (
    <HoverCanvasPreview
      path={ctx.path} data={ctx.data} pkg={ctx.pkg} wasm={ctx.wasm}
      render={renderSkiHoverPreview}
      label="SKI"
    />
  );
}

export const skiFormat: FormatDescriptor = {
  name: 'ski',
  matches: (ext) => ext === '.ski',
  Viewer: SkiFormatViewer,
  Differ: sideBySideDiffer(SkiFormatViewer),
  HoverPreview: SkiHoverPreview,
};
