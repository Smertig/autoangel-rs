import { zip } from 'fflate';
import { downloadBlob, downloadFile } from '@shared/util/download';
import { EcmViewer } from '@shared/components/model-viewer';
import { collectEcmDependencies } from '@shared/util/model-dependencies';
import { sideBySideDiffer, useNullableGetData } from './helpers';
import type { DownloadAction, FormatDescriptor, ViewerContext } from './types';

function EcmFormatViewer({ path, getData, wasm, listFiles }: ViewerContext) {
  const getDataNullable = useNullableGetData(getData);
  return <EcmViewer path={path} wasm={wasm} getData={getDataNullable} listFiles={listFiles} />;
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

export const ecmFormat: FormatDescriptor = {
  name: 'ecm',
  matches: (ext) => ext === '.ecm',
  Viewer: EcmFormatViewer,
  Differ: sideBySideDiffer(EcmFormatViewer),
  downloadActions(ctx: ViewerContext): DownloadAction[] | undefined {
    if (ctx.ext !== '.ecm') return undefined;
    return [
      { label: '\u2B07 Download file',        onClick: () => downloadFile(ctx.path, ctx.getData) },
      { label: '\u2B07 Download model (ZIP)', onClick: () => downloadModelZip(ctx) },
      { label: '\u2B07 Download model (PCK)', onClick: () => downloadModelPck(ctx) },
    ];
  },
};
