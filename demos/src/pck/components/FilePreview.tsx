import type { AutoangelModule } from '../../types/autoangel';
import { findFormat } from '@shared/formats/registry';
import { getExtension } from '@shared/util/files';
import styles from './FilePreview.module.css';

interface FilePreviewProps {
  path: string;
  getData: (path: string) => Promise<Uint8Array>;
  wasm: AutoangelModule;
}

function downloadFile(path: string, getData: (path: string) => Promise<Uint8Array>) {
  getData(path).then((data) => {
    const blob = new Blob([data.buffer as ArrayBuffer]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = path.split(/[\\/]/).pop()!;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

export function FilePreview({ path, getData, wasm }: FilePreviewProps) {
  const ext = getExtension(path);
  const format = findFormat(ext);

  return (
    <div className={styles.filePreviewWrapper}>
      <div className={styles.actionsBar}>
        <button
          className={styles.btnPrimary}
          onClick={() => downloadFile(path, getData)}
        >
          ⬇ Download
        </button>
      </div>
      <div className={styles.previewContent}>
        <format.Viewer path={path} ext={ext} getData={getData} wasm={wasm} />
      </div>
    </div>
  );
}
