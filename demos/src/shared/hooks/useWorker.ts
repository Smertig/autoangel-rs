import { useEffect, useRef, useState } from 'react';

interface WorkerCallbacks {
  onProgress?: (data: any) => void;
  onChunk?: (data: any) => void;
}

interface PendingEntry {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  callbacks: WorkerCallbacks;
}

export interface UseWorkerResult {
  call: <T = any>(
    msg: Record<string, unknown>,
    transfer?: Transferable[],
    callbacks?: WorkerCallbacks,
  ) => Promise<T>;
  terminate: () => void;
  ready: boolean;
}

export function useWorker(createWorker: () => Worker): UseWorkerResult {
  const [ready, setReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<number, PendingEntry>>(new Map());
  const msgIdRef = useRef(0);

  useEffect(() => {
    const worker = createWorker();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { id, type, message, ...rest } = e.data as {
        id: number;
        type: string;
        message?: string;
        [key: string]: unknown;
      };
      const entry = pendingRef.current.get(id);
      if (!entry) return;

      if (type === 'progress') {
        entry.callbacks.onProgress?.(rest);
        return;
      }
      if (type === 'chunk') {
        entry.callbacks.onChunk?.(rest);
        return;
      }

      pendingRef.current.delete(id);
      if (type === 'error') {
        entry.reject(new Error(message));
      } else if (type === 'done') {
        entry.resolve(rest);
      } else {
        // 'result' or any other type
        entry.resolve(rest);
      }
    };

    setReady(true);

    return () => {
      worker.terminate();
      workerRef.current = null;
      // Reject all pending promises
      for (const entry of pendingRef.current.values()) {
        entry.reject(new Error('Worker terminated'));
      }
      pendingRef.current.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const call = <T = any>(
    msg: Record<string, unknown>,
    transfer?: Transferable[],
    callbacks: WorkerCallbacks = {},
  ): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const id = ++msgIdRef.current;
      pendingRef.current.set(id, { resolve, reject, callbacks });
      workerRef.current!.postMessage({ id, ...msg }, transfer ?? []);
    });
  };

  const terminate = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    for (const entry of pendingRef.current.values()) {
      entry.reject(new Error('Worker terminated'));
    }
    pendingRef.current.clear();
  };

  return { call, terminate, ready };
}
