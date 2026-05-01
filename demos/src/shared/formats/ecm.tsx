import { zip } from 'fflate';
import { downloadBlob, downloadFile } from '@shared/util/download';
import { EcmViewer, bridgeModelStatePorts } from '@shared/components/model-viewer';
import { renderEcmHoverPreview } from '@shared/components/model-viewer/internal/render-ecm-hover';
import { HoverCanvasPreview } from '@shared/components/hover-preview/HoverCanvasPreview';
import { collectEcmDependencies } from '@shared/util/model-dependencies';
import { basename } from '@shared/util/path';
import { sideBySideDiffer } from './helpers';
import type { DownloadAction, FormatDescriptor, HoverContext, ViewerContext } from './types';

function EcmFormatViewer({
  path, pkg, wasm, onNavigateToFile, state,
}: ViewerContext) {
  return (
    <EcmViewer
      path={path}
      wasm={wasm}
      pkg={pkg}
      onNavigateToFile={onNavigateToFile}
      state={bridgeModelStatePorts(state)}
    />
  );
}

async function downloadModelZip(ctx: ViewerContext): Promise<void> {
  const { path, pkg, wasm } = ctx;
  const files = await collectEcmDependencies(wasm, path, pkg);

  const zipEntries: Record<string, Uint8Array> = {};
  for (const [filePath, data] of files) {
    zipEntries[filePath] = data;
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(zipEntries, (err, data) => err ? reject(err) : resolve(data)),
  );
  const stem = basename(path).replace(/\.ecm$/i, '');
  downloadBlob(new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }), stem + '.zip');
}

async function downloadModelPck(ctx: ViewerContext): Promise<void> {
  const { path, pkg, wasm } = ctx;
  const files = await collectEcmDependencies(wasm, path, pkg);

  using builder = new wasm.PckBuilder();
  for (const [filePath, data] of files) {
    builder.addFile(filePath, data);
  }
  const pckBytes = builder.toBytes();

  const stem = basename(path).replace(/\.ecm$/i, '');
  downloadBlob(new Blob([pckBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }), stem + '.pck');
}

function EcmHoverPreview(ctx: HoverContext) {
  return (
    <HoverCanvasPreview
      path={ctx.path} data={ctx.data} pkg={ctx.pkg} wasm={ctx.wasm}
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
      { label: '⬇ Download file',        onClick: () => downloadFile(ctx.path, ctx.pkg) },
      { label: '⬇ Download model (ZIP)', onClick: () => downloadModelZip(ctx) },
      { label: '⬇ Download model (PCK)', onClick: () => downloadModelPck(ctx) },
    ];
  },
};
