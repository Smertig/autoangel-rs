import { GfxViewer } from '@shared/components/GfxViewer';
import { sideBySideDiffer } from './helpers';
import { useFileData } from '@shared/hooks/useFileData';
import type { FormatDescriptor, ViewerContext } from './types';

function GfxFormatViewer({ path, getData, wasm }: ViewerContext) {
  const state = useFileData(path, getData);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.message}</div>;

  return <GfxViewer data={state.data} wasm={wasm} />;
}

export const gfxFormat: FormatDescriptor = {
  name: 'gfx',
  matches: (ext) => ext === '.gfx',
  Viewer: GfxFormatViewer,
  Differ: sideBySideDiffer(GfxFormatViewer),
};
