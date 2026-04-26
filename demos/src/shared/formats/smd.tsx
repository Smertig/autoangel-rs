import { SmdViewer, bridgeModelStatePorts } from '@shared/components/model-viewer';
import { sideBySideDiffer } from './helpers';
import { useNullableGetData } from '@shared/hooks/useNullableGetData';
import type { FormatDescriptor, ViewerContext } from './types';

function SmdFormatViewer({
  path, getData, wasm, listFiles, findFile, state,
}: ViewerContext) {
  const getDataNullable = useNullableGetData(getData);
  return (
    <SmdViewer
      path={path}
      wasm={wasm}
      getData={getDataNullable}
      listFiles={listFiles}
      findFile={findFile}
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
