import { useEffect, useRef, useState } from 'react';
import { disposeViewer } from './viewer';

export function useRenderEffect(
  path: string,
  deps: React.DependencyList,
  run: (container: HTMLElement) => Promise<void>,
): { containerRef: React.RefObject<HTMLDivElement | null>; error: string | null } {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const currentPathRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setError(null);
    currentPathRef.current = path;
    run(container).catch((e: unknown) => {
      if (currentPathRef.current !== path) return;
      console.error('[model] Preview failed:', e);
      disposeViewer(container);
      container.innerHTML = '';
      setError(`Model preview failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const container = containerRef.current;
    return () => {
      if (container) {
        disposeViewer(container);
        container.innerHTML = '';
      }
    };
  }, []);

  return { containerRef, error };
}
