import { applyController, HANDLED_CTRL_KINDS, type CtrlState } from './controllers';
import { argbLerp } from './argb';
import { lerp } from './math';
import type { KeyPointSet, KpController, KpCtrlKind } from './gfxTypes';

export interface Track {
  readonly colors: readonly number[];
  readonly positions: readonly (readonly [number, number, number])[];
  readonly scales: readonly number[];
  readonly directions: readonly (readonly [number, number, number, number])[];
  readonly rad2ds: readonly number[];
  readonly spans: readonly number[];          // raw, may include -1
  readonly absTimes: readonly number[];       // cumulative finite spans (0 for hold keypoints)
  readonly startTimeMs: number;
  readonly loopDurationMs: number;
  readonly loopable: boolean;
  readonly controllers: readonly KpController[][];
  readonly unhandledKinds: ReadonlySet<KpCtrlKind>;
}

export interface Sample {
  color: number;
  position: [number, number, number];
  scale: number;
  direction: [number, number, number, number];
  rad2d: number;
  /** 0..1 across the loop. Zero for non-loopable tracks. */
  normalized: number;
}

const EMPTY_TRACK: Track = {
  colors: [], positions: [], scales: [], directions: [], rad2ds: [],
  spans: [], absTimes: [], startTimeMs: 0, loopDurationMs: 0,
  loopable: false, controllers: [],
  unhandledKinds: new Set(),
};

export function buildTrack(kps: KeyPointSet | undefined): Track {
  if (kps === undefined) return EMPTY_TRACK;
  const colors = kps.keypoints.map((kp) => kp.color);
  const positions = kps.keypoints.map((kp) => [...kp.position] as [number, number, number]);
  const scales = kps.keypoints.map((kp) => kp.scale);
  const directions = kps.keypoints.map((kp) => [...kp.direction] as [number, number, number, number]);
  const rad2ds = kps.keypoints.map((kp) => kp.rad_2d);
  const spans = kps.keypoints.map((kp) => kp.time_span);
  const controllers = kps.keypoints.map((kp) => kp.controllers);
  // Engine semantics: `kp.time_span` is the delta ms from the previous
  // keypoint's arrival time. kp[0] arrives at `time_span[0]` (an initial
  // hold/delay), kp[i] arrives at `sum(time_span[0..=i])`. Interpolation
  // between kp[i] and kp[i+1] therefore happens during
  // [absTimes[i], absTimes[i+1]) with duration `time_span[i+1]`.
  const absTimes: number[] = [];
  let acc = 0;
  let sawFinite = false;
  for (const s of spans) {
    if (s > 0) { acc += s; sawFinite = true; }
    absTimes.push(acc);
  }
  const unhandledKinds = new Set<KpCtrlKind>();
  for (const list of controllers) {
    for (const ctrl of list) {
      const kind = ctrl.body.kind;
      if (!HANDLED_CTRL_KINDS.has(kind as never)) unhandledKinds.add(kind);
    }
  }
  return {
    colors, positions, scales, directions, rad2ds, spans, absTimes,
    startTimeMs: kps.start_time,
    loopDurationMs: acc,
    loopable: sawFinite && colors.length >= 2 && acc > 0,
    controllers,
    unhandledKinds,
  };
}

export function trackSignature(t: Track): string {
  return [
    t.startTimeMs, t.loopDurationMs,
    t.colors.join(','), t.spans.join(','),
    t.scales.join(','), t.rad2ds.join(','),
    t.positions.map((p) => p.join('|')).join(';'),
    t.directions.map((d) => d.join('|')).join(';'),
    t.controllers.map((cs) => cs.map((c) => c.body.kind).join('+')).join('/'),
  ].join('\u00a7');
}

export function sampleTrack(track: Track, tMs: number): Sample {
  if (track.colors.length === 0) {
    return { color: 0, position: [0, 0, 0], scale: 1, direction: [0, 0, 0, 1], rad2d: 0, normalized: 0 };
  }
  if (!track.loopable) {
    return { ...baseStateAt(track, 0), normalized: 0 };
  }
  const last = track.colors.length - 1;
  // Pre-kp[0] delay: hold at kp[0].
  if (tMs < track.absTimes[0]) {
    return { ...baseStateAt(track, 0), normalized: tMs / track.loopDurationMs };
  }
  for (let i = 0; i < last; i++) {
    const segStart = track.absTimes[i];
    const segEnd = track.absTimes[i + 1];
    const segSpan = segEnd - segStart;
    if (segSpan <= 0) continue;
    if (tMs >= segStart && tMs < segEnd) {
      const localT = (tMs - segStart) / segSpan;
      const localMs = tMs - segStart;
      const state: CtrlState = {
        color: argbLerp(track.colors[i], track.colors[i + 1], localT),
        scale: lerp(track.scales[i], track.scales[i + 1], localT),
        position: [
          lerp(track.positions[i][0], track.positions[i + 1][0], localT),
          lerp(track.positions[i][1], track.positions[i + 1][1], localT),
          lerp(track.positions[i][2], track.positions[i + 1][2], localT),
        ],
        rad2d: lerp(track.rad2ds[i], track.rad2ds[i + 1], localT),
        axisOff: [0, 0, 0],
      };
      for (const ctrl of track.controllers[i + 1]) {
        // dtMs=0 — sampling a single instant; motion controllers no-op via calcDist(0).
        applyController(ctrl, state, { localMs, dtMs: 0 });
      }
      return {
        ...state,
        // Direction isn't slerped — we hold at segment-start kp. Slerp is a follow-up.
        direction: [...track.directions[i]] as [number, number, number, number],
        normalized: tMs / track.loopDurationMs,
      };
    }
  }
  return { ...baseStateAt(track, last), normalized: 1 };
}

function baseStateAt(track: Track, i: number) {
  return {
    color: track.colors[i],
    position: [...track.positions[i]] as [number, number, number],
    scale: track.scales[i],
    direction: [...track.directions[i]] as [number, number, number, number],
    rad2d: track.rad2ds[i],
  };
}
