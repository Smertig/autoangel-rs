import { useEffect, useRef, useState } from 'react';
import { disposeViewer } from './viewer';

export function useRenderEffect(
  path: string,
  deps: React.DependencyList,
  run: (container: HTMLElement, isStale: () => boolean) => Promise<void>,
): { containerRef: React.RefObject<HTMLDivElement | null>; error: string | null } {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const currentPathRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setError(null);
    currentPathRef.current = path;
    run(container, () => currentPathRef.current !== path).catch((e: unknown) => {
      if (currentPathRef.current !== path) return;
      console.error('[model] Preview failed:', e);
      disposeViewer();
      if (container) container.innerHTML = '';
      setError(`Model preview failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    disposeViewer();
    if (containerRef.current) containerRef.current.innerHTML = '';
  }, []);

  return { containerRef, error };
}
