import { SkiViewer } from '@shared/components/model-viewer';
import { sideBySideDiffer } from './helpers';
import type { FormatDescriptor, ViewerContext } from './types';

function SkiFormatViewer({ path, pkg, wasm }: ViewerContext) {
  return <SkiViewer path={path} wasm={wasm} pkg={pkg} />;
}

export const skiFormat: FormatDescriptor = {
  name: 'ski',
  matches: (ext) => ext === '.ski',
  Viewer: SkiFormatViewer,
  Differ: sideBySideDiffer(SkiFormatViewer),
};
