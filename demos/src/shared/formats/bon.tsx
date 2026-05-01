import { BonViewer } from '@shared/components/model-viewer';
import { renderBonHoverPreview } from '@shared/components/model-viewer/internal/render-bon-hover';
import { HoverCanvasPreview } from '@shared/components/hover-preview/HoverCanvasPreview';
import { sideBySideDiffer } from './helpers';
import type { FormatDescriptor, HoverContext, ViewerContext } from './types';

function BonFormatViewer({ path, pkg, wasm }: ViewerContext) {
  return <BonViewer path={path} wasm={wasm} pkg={pkg} />;
}

function BonHoverPreview(ctx: HoverContext) {
  return (
    <HoverCanvasPreview
      path={ctx.path} data={ctx.data} pkg={ctx.pkg} wasm={ctx.wasm}
      render={renderBonHoverPreview}
      label="BON" width={280} height={280}
    />
  );
}

export const bonFormat: FormatDescriptor = {
  name: 'bon',
  matches: (ext) => ext === '.bon',
  Viewer: BonFormatViewer,
  Differ: sideBySideDiffer(BonFormatViewer),
  HoverPreview: BonHoverPreview,
};
