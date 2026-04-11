import { useEffect, useState } from 'react';
import type { AutoangelModule } from '../../types/autoangel';
import { getExtension, formatSize, IMAGE_EXTENSIONS, CANVAS_IMAGE_EXTENSIONS, MODEL_EXTENSIONS, isLikelyText } from '@shared/util/files';
import { ImagePreview } from '@shared/components/ImagePreview';
import { TextPreview } from '@shared/components/TextPreview';
import { HexDump } from '@shared/components/HexDump';
import { ModelViewer } from '@shared/components/ModelViewer';
import styles from './FilePreview.module.css';

interface FilePreviewProps {
  path: string;
  getData: (path: string) => Promise<Uint8Array>;
  wasm: AutoangelModule;
  encoding: string;
  onEncodingChange: (enc: string) => void;
}

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'model' }
  | { kind: 'data'; data: Uint8Array };

function downloadFile(path: string, data: Uint8Array) {
  const blob = new Blob([data.buffer as ArrayBuffer]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = path.split(/[\\/]/).pop()!;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function FilePreview({ path, getData, wasm, encoding, onEncodingChange }: FilePreviewProps) {
  const ext = getExtension(path);
  const isModel = MODEL_EXTENSIONS.has(ext);

  const [state, setState] = useState<PreviewState>({ kind: 'loading' });

  useEffect(() => {
    if (isModel) {
      setState({ kind: 'model' });
      return;
    }

    let cancelled = false;
    setState({ kind: 'loading' });

    getData(path).then((data) => {
      if (cancelled) return;
      setState({ kind: 'data', data });
    }).catch((e: unknown) => {
      if (cancelled) return;
      setState({ kind: 'error', message: `File not found or decompression failed: ${path}` });
    });

    return () => { cancelled = true; };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.kind === 'loading') {
    return <div className={styles.placeholder}>Loading…</div>;
  }

  if (state.kind === 'error') {
    return <div className={styles.placeholder}>{state.message}</div>;
  }

  if (state.kind === 'model') {
    return (
      <ModelViewer
        path={path}
        wasm={wasm}
        getData={async (p) => {
          try { return await getData(p); }
          catch { return null; }
        }}
      />
    );
  }

  const { data } = state;
  const size = data.byteLength;
  const isText = isLikelyText(data, ext);
  const isImage = IMAGE_EXTENSIONS.has(ext) || CANVAS_IMAGE_EXTENSIONS.has(ext);

  return (
    <div className={styles.filePreviewWrapper}>
      <div className={styles.actionsBar}>
        <span className={styles.fileInfo}>{formatSize(size)}</span>
        <button
          className={styles.btnPrimary}
          onClick={() => downloadFile(path, data)}
        >
          ⬇ Download
        </button>
      </div>

      <div className={styles.previewContent}>
        {isImage ? (
          <ImagePreview
            data={data}
            ext={ext}
            decodeDds={wasm.decodeDds}
            decodeTga={wasm.decodeTga}
          />
        ) : isText ? (
          <TextPreview
            data={data}
            ext={ext}
            encoding={encoding}
            onEncodingChange={onEncodingChange}
            showEncodingSelector={true}
          />
        ) : (
          <HexDump data={data} />
        )}
      </div>
    </div>
  );
}
