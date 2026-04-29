import { BmdViewer } from '@shared/components/model-viewer';
import { renderBmdHoverPreview } from '@shared/components/model-viewer/internal/render-bmd-hover';
import { HoverCanvasPreview } from '@shared/components/hover-preview/HoverCanvasPreview';
import { sideBySideDiffer } from './helpers';
import { useNullableGetData } from '@shared/hooks/useNullableGetData';
import type { FormatDescriptor, ViewerContext, HoverContext } from './types';

function BmdFormatViewer({ path, getData, wasm }: ViewerContext) {
  const getDataNullable = useNullableGetData(getData);
  return <BmdViewer path={path} wasm={wasm} getData={getDataNullable} />;
}

function BmdHoverPreview(ctx: HoverContext) {
  return (
    <HoverCanvasPreview
      path={ctx.path} data={ctx.data} getData={ctx.getData} wasm={ctx.wasm}
      render={renderBmdHoverPreview}
      label="BMD" width={280} height={280}
    />
  );
}

export const bmdFormat: FormatDescriptor = {
  name: 'bmd',
  matches: (ext) => ext === '.bmd',
  Viewer: BmdFormatViewer,
  Differ: sideBySideDiffer(BmdFormatViewer),
  HoverPreview: BmdHoverPreview,
};
