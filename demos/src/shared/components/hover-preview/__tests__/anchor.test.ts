import { describe, it, expect } from 'vitest';
import { computeAnchor } from '../anchor';

const POPOVER_W = 300;
const POPOVER_H = 360;
const VIEWPORT = { w: 1280, h: 800 };
const GAP = 8;

describe('computeAnchor', () => {
  it('places to the right of trigger when room available', () => {
    const trigger = { left: 200, right: 280, top: 100, bottom: 124 };
    const r = computeAnchor(trigger, POPOVER_W, POPOVER_H, VIEWPORT, GAP);
    expect(r.side).toBe('right');
    expect(r.left).toBe(trigger.right + GAP);
    expect(r.top).toBe(trigger.top);
  });

  it('flips to the left when right side overflows viewport', () => {
    const trigger = { left: 1100, right: 1180, top: 100, bottom: 124 };
    const r = computeAnchor(trigger, POPOVER_W, POPOVER_H, VIEWPORT, GAP);
    expect(r.side).toBe('left');
    expect(r.left).toBe(trigger.left - GAP - POPOVER_W);
    expect(r.top).toBe(trigger.top);
  });

  it('clamps top so popover stays inside viewport', () => {
    const trigger = { left: 200, right: 280, top: 700, bottom: 720 };
    const r = computeAnchor(trigger, POPOVER_W, POPOVER_H, VIEWPORT, GAP);
    // 700 + 360 = 1060 > 800; clamp top to 800 - 360 = 440
    expect(r.top).toBe(VIEWPORT.h - POPOVER_H);
  });

  it('clamps top to 0 when trigger is at the very top', () => {
    const trigger = { left: 200, right: 280, top: -10, bottom: 14 };
    const r = computeAnchor(trigger, POPOVER_W, POPOVER_H, VIEWPORT, GAP);
    expect(r.top).toBe(0);
  });
});
