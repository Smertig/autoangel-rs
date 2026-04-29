import { SmdViewer, bridgeModelStatePorts } from '@shared/components/model-viewer';
import { sideBySideDiffer } from './helpers';
import type { FormatDescriptor, ViewerContext } from './types';

function SmdFormatViewer({ path, pkg, wasm, state }: ViewerContext) {
  return (
    <SmdViewer
      path={path}
      wasm={wasm}
      pkg={pkg}
      state={bridgeModelStatePorts(state)}
    />
  );
}

export const smdFormat: FormatDescriptor = {
  name: 'smd',
  matches: (ext) => ext === '.smd',
  Viewer: SmdFormatViewer,
  Differ: sideBySideDiffer(SmdFormatViewer),
};
