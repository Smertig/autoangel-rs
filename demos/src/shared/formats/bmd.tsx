import { BmdViewer } from '@shared/components/model-viewer';
import { sideBySideDiffer } from './helpers';
import { useNullableGetData } from '@shared/hooks/useNullableGetData';
import type { FormatDescriptor, ViewerContext } from './types';

function BmdFormatViewer({ path, getData, wasm }: ViewerContext) {
  const getDataNullable = useNullableGetData(getData);
  return <BmdViewer path={path} wasm={wasm} getData={getDataNullable} />;
}

export const bmdFormat: FormatDescriptor = {
  name: 'bmd',
  matches: (ext) => ext === '.bmd',
  Viewer: BmdFormatViewer,
  Differ: sideBySideDiffer(BmdFormatViewer),
};
