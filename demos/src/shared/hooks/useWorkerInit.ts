import { useEffect, useRef } from 'react';
import type { UseWorkerResult } from './useWorker';

export function useWorkerInit(worker: UseWorkerResult, cdn: string): void {
  const initedRef = useRef(false);
  useEffect(() => {
    if (worker.ready && !initedRef.current) {
      initedRef.current = true;
      worker.call({ type: 'init', cdn }).catch(() => {});
    }
  }, [worker.ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
