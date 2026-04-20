import { SkiViewer } from '@shared/components/model-viewer';
import { sideBySideDiffer, useNullableGetData } from './helpers';
import type { FormatDescriptor, ViewerContext } from './types';

function SkiFormatViewer({ path, getData, wasm }: ViewerContext) {
  const getDataNullable = useNullableGetData(getData);
  return <SkiViewer path={path} wasm={wasm} getData={getDataNullable} />;
}

export const skiFormat: FormatDescriptor = {
  name: 'ski',
  matches: (ext) => ext === '.ski',
  Viewer: SkiFormatViewer,
  Differ: sideBySideDiffer(SkiFormatViewer),
};
