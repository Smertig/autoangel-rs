import { SmdViewer } from '@shared/components/model-viewer';
import { sideBySideDiffer, useNullableGetData } from './helpers';
import type { FormatDescriptor, ViewerContext } from './types';

function SmdFormatViewer({ path, getData, wasm, listFiles }: ViewerContext) {
  const getDataNullable = useNullableGetData(getData);
  return <SmdViewer path={path} wasm={wasm} getData={getDataNullable} listFiles={listFiles} />;
}

export const smdFormat: FormatDescriptor = {
  name: 'smd',
  matches: (ext) => ext === '.smd',
  Viewer: SmdFormatViewer,
  Differ: sideBySideDiffer(SmdFormatViewer),
};
