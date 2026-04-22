import { argbLerp } from './argb';
import { clamp, clamp8, lerp } from './math';
import type { HandledCtrlKind, KpController, KpCtrlBody } from './gfxTypes';

// Re-export for convenience — historical API surface.
export type { KpController, KpCtrlBody } from './gfxTypes';

/** CtrlType kinds for which `applyController` has a real implementation. */
export const HANDLED_CTRL_KINDS: ReadonlySet<HandledCtrlKind> = new Set<HandledCtrlKind>([
  'color', 'scale', 'cl_trans', 'scale_trans',
  'move', 'rot', 'centri_move',
  'rot_axis', 'revol',
]);

export interface CtrlState {
  color: number;        // ARGB packed 0xAARRGGBB
  scale: number;
  position: [number, number, number];
  rad2d: number;
  /**
   * Cumulative displacement applied by translational affectors
   * (`move`, `curve_move`) during this particle's affector pass — mirrors
   * the engine's `PROC_DATA::m_vAxisOff`. Rotational affectors
   * (`rot_axis`, `revol`) add it to their pivot so subsequent rotation
   * follows the Move-translated frame rather than the world-static pivot.
   */
  axisOff: [number, number, number];
  // direction quaternion intentionally untouched — our particles render
  // with a single Z-axis angle (`rad2d`), not a full orientation frame.
}

export interface ApplyContext {
  /** Wall-clock delta ms since keypoint start, for velocity-based ctrls. */
  localMs: number;
  /**
   * Frame delta in ms. Motion controllers (`move`, `rot`, `centri_move`)
   * integrate per-frame translation via engine `CalcDist(vel, acc, age, dt)`.
   * Keypoint-inner sampling passes 0 — `calcDist` returns 0 so motion
   * controllers contribute nothing at a single sample.
   */
  dtMs: number;
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
    case 'move':        return applyMove(body, state, ctx);
    case 'rot':         return applyRot(body, state, ctx);
    case 'centri_move': return applyCentriMove(body, state, ctx);
    case 'rot_axis':    return applyAxisRotation(body, state, ctx);
    case 'revol':       return applyAxisRotation(body, state, ctx);

    // Deferred — explicit no-op so the dispatcher is exhaustive.
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

/**
 * Engine `CalcDist(vel, acc, age, dt)` — trapezoidal integration of a
 * linearly-changing velocity over one frame:
 *   v_start = vel + acc * age
 *   v_end   = v_start + acc * dt
 *   dist    = 0.5 * (v_start + v_end) * dt
 * Used by motion affectors (move, rot, centri_move, rot_axis, revol).
 * `age` is the particle's age at the end of the current frame (engine
 * increments `m_fTTL` before reading it in `TriggerAffectors`).
 */
function calcDist(vel: number, acc: number, ageSec: number, dtSec: number): number {
  const vStart = vel + acc * ageSec;
  const vEnd = vStart + acc * dtSec;
  return 0.5 * (vStart + vEnd) * dtSec;
}

function applyMove(
  body: Extract<KpCtrlBody, { kind: 'move' }>,
  s: CtrlState,
  ctx: ApplyContext,
): boolean {
  const age = ctx.localMs / 1000;
  const dt = ctx.dtMs / 1000;
  const d = calcDist(body.vel, body.acc, age, dt);
  const dx = body.dir[0] * d;
  const dy = body.dir[1] * d;
  const dz = body.dir[2] * d;
  s.position[0] += dx; s.position[1] += dy; s.position[2] += dz;
  // Engine also accumulates Move's translation into PROC_DATA::m_vAxisOff so
  // later rotational affectors pivot around the translated frame.
  s.axisOff[0] += dx; s.axisOff[1] += dy; s.axisOff[2] += dz;
  return true;
}

function applyRot(
  body: Extract<KpCtrlBody, { kind: 'rot' }>,
  s: CtrlState,
  ctx: ApplyContext,
): boolean {
  const age = ctx.localMs / 1000;
  const dt = ctx.dtMs / 1000;
  s.rad2d += calcDist(body.vel, body.acc, age, dt);
  return true;
}

function applyCentriMove(
  body: Extract<KpCtrlBody, { kind: 'centri_move' }>,
  s: CtrlState,
  ctx: ApplyContext,
): boolean {
  if (body.vel === 0) return true;
  const age = ctx.localMs / 1000;
  const dt = ctx.dtMs / 1000;
  const d = calcDist(body.vel, body.acc, age, dt);
  const dx = s.position[0] - body.center[0];
  const dy = s.position[1] - body.center[1];
  const dz = s.position[2] - body.center[2];
  const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (body.vel < 0 && mag === 0) return true;
  // Inward overshoot past the center — snap to center (matches engine
  // branch `if (fDist < 0 && fMag < -fDist)`).
  if (d < 0 && mag < -d) {
    s.position[0] = body.center[0];
    s.position[1] = body.center[1];
    s.position[2] = body.center[2];
    return true;
  }
  if (mag > 0) {
    const inv = 1 / mag;
    s.position[0] += dx * inv * d;
    s.position[1] += dy * inv * d;
    s.position[2] += dz * inv * d;
  }
  return true;
}

/**
 * Rodrigues rotation of `s.position` around the line through `(px,py,pz)`
 * with unit direction `(ax,ay,az)` by `angle` radians. Caller must supply
 * a normalised axis — engine GFX files are authored with unit axes.
 */
function rotatePositionAroundLine(
  s: CtrlState,
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  angle: number,
): void {
  const vx = s.position[0] - px;
  const vy = s.position[1] - py;
  const vz = s.position[2] - pz;
  const c = Math.cos(angle);
  const sN = Math.sin(angle);
  const oneMinusC = 1 - c;
  const cx = ay * vz - az * vy;
  const cy = az * vx - ax * vz;
  const cz = ax * vy - ay * vx;
  const dot = ax * vx + ay * vy + az * vz;
  s.position[0] = px + vx * c + cx * sN + ax * dot * oneMinusC;
  s.position[1] = py + vy * c + cy * sN + ay * dot * oneMinusC;
  s.position[2] = pz + vz * c + cz * sN + az * dot * oneMinusC;
}

/**
 * Shared impl for `rot_axis` (102) and `revol` (103) — both orbit the
 * particle position around an axis-aligned line. `rot_axis` additionally
 * rotates the engine's `m_vDir` orientation quaternion, but we render
 * particles with a single Z-axis angle (`rad2d`), so that update is a
 * visual no-op and skipped. Pivot follows the Move-accumulated `axisOff`
 * so chained `move → rotate` pivots around the translated frame.
 */
function applyAxisRotation(
  body: { pos: readonly [number, number, number]; axis: readonly [number, number, number]; vel: number; acc: number },
  s: CtrlState,
  ctx: ApplyContext,
): boolean {
  const age = ctx.localMs / 1000;
  const dt = ctx.dtMs / 1000;
  const angle = calcDist(body.vel, body.acc, age, dt);
  rotatePositionAroundLine(
    s,
    body.pos[0] + s.axisOff[0], body.pos[1] + s.axisOff[1], body.pos[2] + s.axisOff[2],
    body.axis[0], body.axis[1], body.axis[2],
    angle,
  );
  return true;
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
