import { type RefObject, useEffect } from 'react';

export function useDividerDrag(
  dividerRef: RefObject<HTMLDivElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  options?: { min?: number; max?: number },
): void {
  const min = options?.min ?? 140;
  const max = options?.max;

  useEffect(() => {
    const divider = dividerRef.current;
    const panel = panelRef.current;
    if (!divider || !panel) return;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = panel.offsetWidth;
      divider.classList.add('dragging');

      const onMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - startX;
        const maxWidth = max ?? window.innerWidth * 0.5;
        const newWidth = Math.max(min, Math.min(startWidth + delta, maxWidth));
        panel.style.width = `${newWidth}px`;
      };

      const onMouseUp = () => {
        divider.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    divider.addEventListener('mousedown', onMouseDown);
    return () => {
      divider.removeEventListener('mousedown', onMouseDown);
    };
  }, [dividerRef, panelRef, min, max]);
}
