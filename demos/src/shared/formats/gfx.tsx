import { GfxViewer } from '@shared/components/gfx';
import { sideBySideDiffer } from './helpers';
import { useFileData } from '@shared/hooks/useFileData';
import type { FormatDescriptor, ViewerContext } from './types';

function GfxFormatViewer(ctx: ViewerContext) {
  const state = useFileData(ctx.path, ctx.getData);
  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.message}</div>;
  return <GfxViewer data={state.data} context={ctx} />;
}

export const gfxFormat: FormatDescriptor = {
  name: 'gfx',
  matches: (ext) => ext === '.gfx',
  Viewer: GfxFormatViewer,
  Differ: sideBySideDiffer(GfxFormatViewer),
};
