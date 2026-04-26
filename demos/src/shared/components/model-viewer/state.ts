import type { LoopMode } from './internal/scene';
import type { StatePorts } from '@shared/formats/types';

export interface ModelEntryState {
  clip?: string;
  paused?: boolean;
  /** Virtual-time position in seconds. Only meaningful when `paused === true`. */
  posInClip?: number;
}

export interface ModelFormatState {
  speed?: number;
  loopMode?: LoopMode;
}

/** Shared parameterization of `StatePorts` for the model-viewer chain. */
export type ModelStatePorts = StatePorts<ModelEntryState, ModelFormatState>;

export function decodeModelEntryState(raw: unknown): ModelEntryState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: ModelEntryState = {};
  if (typeof r.clip === 'string') out.clip = r.clip;
  if (typeof r.paused === 'boolean') out.paused = r.paused;
  if (typeof r.posInClip === 'number' && Number.isFinite(r.posInClip)) out.posInClip = r.posInClip;
  return out;
}

export function decodeModelFormatState(raw: unknown): ModelFormatState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: ModelFormatState = {};
  if (typeof r.speed === 'number' && Number.isFinite(r.speed)) out.speed = r.speed;
  if (r.loopMode === 'loop' || r.loopMode === 'once' || r.loopMode === 'pingpong') {
    out.loopMode = r.loopMode;
  }
  return out;
}

/**
 * Bridge opaque host-side ports to the model viewer's typed schemas. The
 * `initial*` blobs run through the decoders; the callbacks pass through —
 * an `(unknown) => void` is structurally assignable to `(Typed) => void`.
 */
export function bridgeModelStatePorts(
  ports: StatePorts | undefined,
): StatePorts<ModelEntryState, ModelFormatState> | undefined {
  if (!ports) return undefined;
  return {
    initialEntryState: decodeModelEntryState(ports.initialEntryState),
    initialFormatState: decodeModelFormatState(ports.initialFormatState),
    onEntryStateChange: ports.onEntryStateChange,
    onFormatStateChange: ports.onFormatStateChange,
  };
}
