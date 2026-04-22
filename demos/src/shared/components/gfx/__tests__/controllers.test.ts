import { describe, it, expect } from 'vitest';
import { applyController, type CtrlState } from '../util/controllers';

const baseState: CtrlState = { color: 0xFF808080, scale: 1, position: [0, 0, 0], rad2d: 0 };

function fresh(): CtrlState { return { ...baseState, position: [...baseState.position] as [number, number, number] }; }

const wrap = (kind: any, body: any) => ({ start_time: 0, end_time: -1, body: { kind, ...body } });

describe('applyController', () => {
  it('color: per-channel signed delta accumulates linearly per second', () => {
    // color_delta = (R+10/s, G-20/s, B+0, A+0); after 500 ms → (+5, -10, 0, 0)
    const s = fresh();
    s.color = 0xFF808080;
    const handled = applyController(
      wrap('color', { color_delta: [10, -20, 0, 0] }) as any,
      s,
      { localMs: 500, dtMs: 0 },
    );
    expect(handled).toBe(true);
    // ARGB format: 0xAARRGGBB. R=128+5=133, G=128-10=118, B=128.
    const r = (s.color >>> 16) & 0xff;
    const g = (s.color >>> 8) & 0xff;
    expect(r).toBe(133);
    expect(g).toBe(118);
  });

  it('color: clamps channels at [0, 255]', () => {
    const s = fresh();
    s.color = 0xFF000000; // all channels at 0 except alpha
    applyController(
      wrap('color', { color_delta: [-50, -50, -50, 100] }) as any,
      s,
      { localMs: 1000, dtMs: 0 },
    );
    // RGB stays at 0, alpha clamps to 255 (already at FF).
    expect(s.color & 0xff).toBe(0); // B
    expect((s.color >>> 8) & 0xff).toBe(0); // G
    expect((s.color >>> 16) & 0xff).toBe(0); // R
    expect((s.color >>> 24) & 0xff).toBe(255); // A clamped
  });

  it('scale: scale_delta * localMs/1000, clamped to [min, max]', () => {
    const s = fresh();
    s.scale = 1;
    applyController(
      wrap('scale', { scale_delta: 2, min_scale: 0.5, max_scale: 4 }) as any,
      s,
      { localMs: 500, dtMs: 0 },
    );
    // 1 + 2 * 0.5 = 2 (within range)
    expect(s.scale).toBe(2);

    s.scale = 1;
    applyController(
      wrap('scale', { scale_delta: 100, min_scale: 0.5, max_scale: 4 }) as any,
      s,
      { localMs: 1000, dtMs: 0 },
    );
    expect(s.scale).toBe(4); // clamped to max
  });

  it('cl_trans: walks dest_colors by trans_times_ms with linear interpolation', () => {
    // origin red → dest[0] green over 1000ms → dest[1] blue over 500ms.
    const s = fresh();
    s.color = 0xFF000000; // ignored — cl_trans uses color_origin
    const ctrl = wrap('cl_trans', {
      color_origin: 0xFFFF0000,
      dest_colors: [0xFF00FF00, 0xFF0000FF],
      trans_times_ms: [1000, 500],
      alpha_only: false,
    });

    // At 500 ms (mid first segment) → halfway between red and green.
    const s1 = fresh();
    s1.color = 0;
    applyController(ctrl as any, s1, { localMs: 500, dtMs: 0 });
    // 127.5 → rounds to 128 on both channels (Math.round half-up).
    expect((s1.color >>> 16) & 0xff).toBe(128); // R halfway
    expect((s1.color >>> 8) & 0xff).toBe(128);  // G halfway

    // At 1250 ms (mid second segment) → halfway between green and blue.
    const s2 = fresh();
    applyController(ctrl as any, s2, { localMs: 1250, dtMs: 0 });
    expect((s2.color >>> 16) & 0xff).toBe(0);
    expect((s2.color >>> 8) & 0xff).toBe(128);  // G halfway
    expect(s2.color & 0xff).toBe(128);          // B halfway
  });

  it('cl_trans: alpha_only=true freezes RGB at color_origin and lerps alpha only', () => {
    const ctrl = wrap('cl_trans', {
      color_origin: 0xFFFF8040,    // RGB locked to this
      dest_colors: [0x00FF8040],   // alpha 0 at end
      trans_times_ms: [1000],
      alpha_only: true,
    });
    const s = fresh();
    applyController(ctrl as any, s, { localMs: 500, dtMs: 0 });
    // 255 → 0 at t=0.5 is 127.5 → Math.round = 128.
    expect((s.color >>> 24) & 0xff).toBe(128); // alpha halfway
    expect((s.color >>> 16) & 0xff).toBe(0xFF); // R unchanged from origin
    expect((s.color >>> 8) & 0xff).toBe(0x80);
    expect(s.color & 0xff).toBe(0x40);
  });

  it('scale_trans: walks dest_scales by trans_times_ms with linear interpolation', () => {
    const ctrl = wrap('scale_trans', {
      scale_origin: 1,
      dest_scales: [2, 0.5],
      trans_times_ms: [1000, 500],
    });
    const s = fresh();
    applyController(ctrl as any, s, { localMs: 500, dtMs: 0 });
    expect(s.scale).toBeCloseTo(1.5);  // halfway 1→2

    const s2 = fresh();
    applyController(ctrl as any, s2, { localMs: 1250, dtMs: 0 });
    expect(s2.scale).toBeCloseTo(1.25); // halfway 2→0.5
  });

  it('returns false for still-deferred kinds', () => {
    const deferred = ['cl_noise', 'sca_noise', 'curve_move', 'noise_base', 'unknown'];
    for (const kind of deferred) {
      const s = fresh();
      const handled = applyController(wrap(kind, {}) as any, s, { localMs: 0, dtMs: 0 });
      expect(handled).toBe(false);
    }
  });
});
