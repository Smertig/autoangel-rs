import { zip } from 'fflate';
import { downloadBlob, downloadFile } from '@shared/util/download';
import { EcmViewer, bridgeModelStatePorts } from '@shared/components/model-viewer';
import { renderEcmHoverPreview } from '@shared/components/model-viewer/internal/render-ecm-hover';
import { HoverCanvasPreview } from '@shared/components/hover-preview/HoverCanvasPreview';
import { collectEcmDependencies } from '@shared/util/model-dependencies';
import { sideBySideDiffer } from './helpers';
import { useNullableGetData } from '@shared/hooks/useNullableGetData';
import type { DownloadAction, FormatDescriptor, HoverContext, ViewerContext } from './types';

function EcmFormatViewer({
  path, getData, wasm, listFiles, findFile, onNavigateToFile, state,
}: ViewerContext) {
  const getDataNullable = useNullableGetData(getData);
  return (
    <EcmViewer
      path={path}
      wasm={wasm}
      getData={getDataNullable}
      listFiles={listFiles}
      findFile={findFile}
      onNavigateToFile={onNavigateToFile}
      state={bridgeModelStatePorts(state)}
    />
  );
}

async function downloadModelZip(ctx: ViewerContext): Promise<void> {
  const { path, getData, wasm, listFiles } = ctx;
  const files = await collectEcmDependencies(wasm, path, getData, listFiles);

  const zipEntries: Record<string, Uint8Array> = {};
  for (const [filePath, data] of files) {
    const zipPath = filePath.replace(/\\/g, '/').replace(/^\//, '');
    zipEntries[zipPath] = data;
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(zipEntries, (err, data) => err ? reject(err) : resolve(data)),
  );
  const basename = path.split(/[\\/]/).pop()!.replace(/\.ecm$/i, '');
  downloadBlob(new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }), basename + '.zip');
}

async function downloadModelPck(ctx: ViewerContext): Promise<void> {
  const { path, getData, wasm, listFiles } = ctx;
  const files = await collectEcmDependencies(wasm, path, getData, listFiles);

  using builder = new wasm.PckBuilder();
  for (const [filePath, data] of files) {
    builder.addFile(filePath, data);
  }
  const pckBytes = builder.toBytes();

  const basename = path.split(/[\\/]/).pop()!.replace(/\.ecm$/i, '');
  downloadBlob(new Blob([pckBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }), basename + '.pck');
}

function EcmHoverPreview(ctx: HoverContext) {
  return (
    <HoverCanvasPreview
      path={ctx.path} data={ctx.data} getData={ctx.getData} wasm={ctx.wasm}
      render={renderEcmHoverPreview}
      label="ECM" width={280} height={280}
    />
  );
}

export const ecmFormat: FormatDescriptor = {
  name: 'ecm',
  matches: (ext) => ext === '.ecm',
  Viewer: EcmFormatViewer,
  Differ: sideBySideDiffer(EcmFormatViewer),
  HoverPreview: EcmHoverPreview,
  downloadActions(ctx: ViewerContext): DownloadAction[] | undefined {
    if (ctx.ext !== '.ecm') return undefined;
    return [
      { label: '\u2B07 Download file',        onClick: () => downloadFile(ctx.path, ctx.getData) },
      { label: '\u2B07 Download model (ZIP)', onClick: () => downloadModelZip(ctx) },
      { label: '\u2B07 Download model (PCK)', onClick: () => downloadModelPck(ctx) },
    ];
  },
};
