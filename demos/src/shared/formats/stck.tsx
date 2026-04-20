import { StckViewer } from '@shared/components/StckViewer';
import { useFileData } from '@shared/hooks/useFileData';
import { sideBySideDiffer } from './helpers';
import type { FormatDescriptor, ViewerContext } from './types';

function StckFormatViewer({ path, getData, wasm }: ViewerContext) {
  const state = useFileData(path, getData);
  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error')   return <div>Error: {state.message}</div>;
  return <StckViewer data={state.data} wasm={wasm} />;
}

export const stckFormat: FormatDescriptor = {
  name: 'stck',
  matches: (ext) => ext === '.stck',
  Viewer: StckFormatViewer,
  Differ: sideBySideDiffer(StckFormatViewer),
};
