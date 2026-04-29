import { useState } from 'react';
import { TEXT_EXTENSIONS } from '@shared/util/files';
import { TextPreview } from '@shared/components/TextPreview';
import { TextDiff } from '@pck-diff/components/TextDiff';
import { useFileData } from '@shared/hooks/useFileData';
import type { FormatDescriptor, ViewerContext, DifferContext } from './types';

function TextViewer({ path, ext, pkg }: ViewerContext) {
  const [encoding, setEncoding] = useState('auto');
  const state = useFileData(path, pkg);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.message}</div>;

  return (
    <TextPreview
      data={state.data}
      ext={ext}
      encoding={encoding}
      onEncodingChange={setEncoding}
      showEncodingSelector={true}
    />
  );
}

function TextDiffer({ path, ext, leftData, rightData }: DifferContext) {
  return <TextDiff leftData={leftData} rightData={rightData} path={path} ext={ext} />;
}

export const textFormat: FormatDescriptor = {
  name: 'text',
  matches: (ext) => TEXT_EXTENSIONS.has(ext),
  Viewer: TextViewer,
  Differ: TextDiffer,
};
