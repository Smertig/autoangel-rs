import { useState, useEffect } from 'react';

type FileDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Uint8Array };

export function useFileData(
  path: string,
  getData: (path: string) => Promise<Uint8Array>,
): FileDataState {
  const [state, setState] = useState<FileDataState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getData(path).then(
      data => { if (!cancelled) setState({ status: 'loaded', data }); },
      err => { if (!cancelled) setState({ status: 'error', message: String(err) }); },
    );
    return () => { cancelled = true; };
  }, [path, getData]);

  return state;
}
