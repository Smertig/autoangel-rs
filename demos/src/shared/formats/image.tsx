import { IMAGE_EXTENSIONS, CANVAS_IMAGE_EXTENSIONS } from '@shared/util/files';
import { ImagePreview } from '@shared/components/ImagePreview';
import { ImageDiff } from '@pck-diff/components/ImageDiff';
import { useFileData } from '@shared/hooks/useFileData';
import type { FormatDescriptor, ViewerContext, DifferContext } from './types';

function ImageViewer({ path, ext, getData, wasm }: ViewerContext) {
  const state = useFileData(path, getData);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.message}</div>;

  return (
    <ImagePreview
      data={state.data}
      ext={ext}
      decodeDds={wasm.decodeDds}
      decodeTga={wasm.decodeTga}
    />
  );
}

function ImageDiffer({ path, ext, leftData, rightData, wasm }: DifferContext) {
  return <ImageDiff leftData={leftData} rightData={rightData} path={path} ext={ext} wasm={wasm} />;
}

export const imageFormat: FormatDescriptor = {
  name: 'image',
  matches: (ext) => IMAGE_EXTENSIONS.has(ext) || CANVAS_IMAGE_EXTENSIONS.has(ext),
  Viewer: ImageViewer,
  Differ: ImageDiffer,
};
