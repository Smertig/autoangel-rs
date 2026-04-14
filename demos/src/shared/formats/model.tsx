import { useCallback } from 'react';
import { zip } from 'fflate';
import { MODEL_EXTENSIONS } from '@shared/util/files';
import { downloadBlob, downloadFile } from '@shared/util/download';
import { ModelViewer } from '@shared/components/ModelViewer';
import { collectEcmDependencies } from '@shared/util/model-dependencies';
import { sideBySideDiffer } from './helpers';
import type { DownloadAction, FormatDescriptor, ViewerContext } from './types';

function ModelFormatViewer({ path, getData, wasm, listFiles }: ViewerContext) {
  const getDataNullable = useCallback(
    async (p: string): Promise<Uint8Array | null> => {
      try { return await getData(p); }
      catch { return null; }
    },
    [getData],
  );
  return <ModelViewer path={path} wasm={wasm} getData={getDataNullable} listFiles={listFiles} />;
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

export const modelFormat: FormatDescriptor = {
  name: 'model',
  matches: (ext) => MODEL_EXTENSIONS.has(ext),
  Viewer: ModelFormatViewer,
  Differ: sideBySideDiffer(ModelFormatViewer),
  downloadActions(ctx: ViewerContext): DownloadAction[] | undefined {
    if (ctx.ext !== '.ecm') return undefined;
    return [
      {
        label: '⬇ Download file',
        onClick: () => downloadFile(ctx.path, ctx.getData),
      },
      {
        label: '⬇ Download model (ZIP)',
        onClick: () => downloadModelZip(ctx),
      },
    ];
  },
};
