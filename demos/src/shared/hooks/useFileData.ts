import { useState, useEffect } from 'react';
import type { PackageView } from '@shared/package';

type FileDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Uint8Array };

export function useFileData(path: string, pkg: PackageView): FileDataState {
  const [state, setState] = useState<FileDataState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    pkg.read(path).then(
      data => {
        if (cancelled) return;
        if (!data) setState({ status: 'error', message: `File not found: ${path}` });
        else setState({ status: 'loaded', data });
      },
      err => { if (!cancelled) setState({ status: 'error', message: String(err) }); },
    );
    return () => { cancelled = true; };
  }, [path, pkg]);

  return state;
}
