import { useCallback } from 'react';
import { MODEL_EXTENSIONS } from '@shared/util/files';
import { ModelViewer } from '@shared/components/ModelViewer';
import { sideBySideDiffer } from './helpers';
import type { FormatDescriptor, ViewerContext } from './types';

function ModelFormatViewer({ path, getData, wasm }: ViewerContext) {
  const getDataNullable = useCallback(
    async (p: string): Promise<Uint8Array | null> => {
      try { return await getData(p); }
      catch { return null; }
    },
    [getData],
  );
  return <ModelViewer path={path} wasm={wasm} getData={getDataNullable} />;
}

export const modelFormat: FormatDescriptor = {
  name: 'model',
  matches: (ext) => MODEL_EXTENSIONS.has(ext),
  Viewer: ModelFormatViewer,
  Differ: sideBySideDiffer(ModelFormatViewer),
};
