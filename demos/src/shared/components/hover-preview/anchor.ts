export interface TriggerRect { left: number; right: number; top: number; bottom: number; }
export interface Viewport { w: number; h: number; }
export interface AnchorResult {
  left: number;
  top: number;
  side: 'right' | 'left';
}

export function computeAnchor(
  trigger: TriggerRect,
  popoverW: number,
  popoverH: number,
  viewport: Viewport,
  gap: number,
): AnchorResult {
  const rightEdge = trigger.right + gap + popoverW;
  const side: 'right' | 'left' = rightEdge <= viewport.w ? 'right' : 'left';
  const left = side === 'right'
    ? trigger.right + gap
    : trigger.left - gap - popoverW;

  let top = trigger.top;
  if (top + popoverH > viewport.h) top = viewport.h - popoverH;
  if (top < 0) top = 0;

  return { left, top, side };
}
