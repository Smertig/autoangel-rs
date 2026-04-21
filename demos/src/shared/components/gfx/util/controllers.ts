import { argbLerp } from './argb';
import { clamp, clamp8, lerp } from './math';
import type { HandledCtrlKind, KpController, KpCtrlBody } from './gfxTypes';

// Re-export for convenience — historical API surface.
export type { KpController, KpCtrlBody } from './gfxTypes';

/** CtrlType kinds for which `applyController` has a real implementation. */
export const HANDLED_CTRL_KINDS: ReadonlySet<HandledCtrlKind> = new Set<HandledCtrlKind>([
  'color', 'scale', 'cl_trans', 'scale_trans',
]);

export interface CtrlState {
  color: number;        // ARGB packed 0xAARRGGBB
  scale: number;
  position: [number, number, number];
  rad2d: number;
  // direction quaternion intentionally untouched in this batch
}

export interface ApplyContext {
  /** Wall-clock delta ms since keypoint start, for velocity-based ctrls. */
  localMs: number;
}

/** Returns true if handled, false for deferred/unknown variants. */
export function applyController(
  ctrl: KpController,
  state: CtrlState,
  ctx: ApplyContext,
): boolean {
  const body = ctrl.body;
  switch (body.kind) {
    case 'color':       applyColor(body, state, ctx); return true;
    case 'scale':       applyScale(body, state, ctx); return true;
    case 'cl_trans':    applyClTrans(body, state, ctx); return true;
    case 'scale_trans': applyScaleTrans(body, state, ctx); return true;

    // Deferred — explicit no-op so the dispatcher is exhaustive.
    case 'move':        return false;  // TODO(ctrl-move): translation via vel+acc
    case 'rot':         return false;  // TODO(ctrl-rot): rotate rad2d via vel+acc
    case 'rot_axis':    return false;  // TODO(ctrl-rot-axis): quat rotation around arbitrary axis
    case 'revol':       return false;  // TODO(ctrl-revol): orbit position around axis
    case 'centri_move': return false;  // TODO(ctrl-centri): move position toward center at vel+acc
    case 'cl_noise':    return false;  // TODO(ctrl-cl-noise): perlin alpha jitter on keypoint color
    case 'sca_noise':   return false;  // TODO(ctrl-sca-noise): perlin scale jitter
    case 'curve_move':  return false;  // TODO(ctrl-curve-move): position along cubic bezier
    case 'noise_base':  return false;  // TODO(ctrl-noise-base): shared perlin source
    case 'unknown':     return false;  // forward-compat fallback (CtrlType 113 etc)
  }
  // Adding a new variant to KpCtrlBody without a case will fail at `tsc`.
  const _exhaustive: never = body;
  return _exhaustive;
}

// --- per-controller implementations ---

function applyColor(
  body: Extract<KpCtrlBody, { kind: 'color' }>,
  s: CtrlState,
  ctx: ApplyContext,
): void {
  const dt = ctx.localMs / 1000;
  const r = clamp8(((s.color >>> 16) & 0xff) + body.color_delta[0] * dt);
  const g = clamp8(((s.color >>> 8) & 0xff) + body.color_delta[1] * dt);
  const b = clamp8((s.color & 0xff) + body.color_delta[2] * dt);
  const a = clamp8(((s.color >>> 24) & 0xff) + body.color_delta[3] * dt);
  s.color = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

function applyScale(
  body: Extract<KpCtrlBody, { kind: 'scale' }>,
  s: CtrlState,
  ctx: ApplyContext,
): void {
  const dt = ctx.localMs / 1000;
  s.scale = clamp(s.scale + body.scale_delta * dt, body.min_scale, body.max_scale);
}

function applyClTrans(
  body: Extract<KpCtrlBody, { kind: 'cl_trans' }>,
  s: CtrlState,
  ctx: ApplyContext,
): void {
  const seg = findSegment(body.trans_times_ms, ctx.localMs);
  const startColor = seg.idx === 0 ? body.color_origin : body.dest_colors[seg.idx - 1];
  const endColor = body.dest_colors[seg.idx];
  if (startColor === undefined || endColor === undefined) return;
  if (body.alpha_only) {
    const startA = (startColor >>> 24) & 0xff;
    const endA = (endColor >>> 24) & 0xff;
    const a = Math.round(lerp(startA, endA, seg.local));
    // Freeze RGB at color_origin.
    s.color = ((a << 24) | (body.color_origin & 0x00ffffff)) >>> 0;
  } else {
    s.color = argbLerp(startColor, endColor, seg.local);
  }
}

function applyScaleTrans(
  body: Extract<KpCtrlBody, { kind: 'scale_trans' }>,
  s: CtrlState,
  ctx: ApplyContext,
): void {
  const seg = findSegment(body.trans_times_ms, ctx.localMs);
  const start = seg.idx === 0 ? body.scale_origin : body.dest_scales[seg.idx - 1];
  const end = body.dest_scales[seg.idx];
  if (start === undefined || end === undefined) return;
  s.scale = lerp(start, end, seg.local);
}

/** Walks cumulative `timesMs`; values past the last segment clamp to `(last, 1)`. */
function findSegment(timesMs: number[], localMs: number): { idx: number; local: number } {
  let acc = 0;
  for (let i = 0; i < timesMs.length; i++) {
    const span = timesMs[i];
    if (span <= 0) continue;
    if (localMs < acc + span) {
      return { idx: i, local: (localMs - acc) / span };
    }
    acc += span;
  }
  return { idx: timesMs.length - 1, local: 1 };
}
