import { isLikelyText } from '@shared/util/files';
import { TextPreview } from '@shared/components/TextPreview';
import { HexDump } from '@shared/components/HexDump';
import { TextDiff } from '@pck-diff/components/TextDiff';
import { BinaryDiff } from '@pck-diff/components/BinaryDiff';
import { useFileData } from '@shared/hooks/useFileData';
import type { FormatDescriptor, ViewerContext, DifferContext } from './types';

function FallbackViewer({ path, ext, getData }: ViewerContext) {
  const state = useFileData(path, getData);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.message}</div>;

  const { data } = state;
  if (isLikelyText(data, ext)) {
    return <TextPreview data={data} ext={ext} />;
  }
  return <HexDump data={data} />;
}

function FallbackDiffer({ path, ext, leftData, rightData }: DifferContext) {
  if (isLikelyText(leftData, ext) && isLikelyText(rightData, ext)) {
    return <TextDiff leftData={leftData} rightData={rightData} path={path} ext={ext} />;
  }
  return <BinaryDiff leftData={leftData} rightData={rightData} path={path} />;
}

export const fallbackFormat: FormatDescriptor = {
  name: 'fallback',
  matches: () => true,
  Viewer: FallbackViewer,
  Differ: FallbackDiffer,
};
