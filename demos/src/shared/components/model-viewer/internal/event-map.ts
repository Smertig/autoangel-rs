export const EVENT_GFX = 100 as const;
export const EVENT_SOUND = 101 as const;

export interface AnimEvent {
  type: typeof EVENT_GFX | typeof EVENT_SOUND;
  filePath: string; // engine-relative path, e.g. "人物\技能\刺客\foo.gfx"
  startTime: number; // ms, 0 if not set
  timeSpan: number; // ms, -1 = infinite
  once: boolean;
  hookName: string; // empty if not set
  hookOffset: [number, number, number];
  hookYaw: number;
  hookPitch: number;
  hookRot: number;
  bindParent: boolean;
  gfxScale: number; // 1.0 default when EcmEvent.gfx_scale is null
  gfxSpeed: number; // 1.0 default when EcmEvent.gfx_speed is null
}

/** Build a map from STCK animation name stem → events from ECM combined actions.
 *  When `animNames` is omitted, every base action name in the ECM is included —
 *  callers can extract from a wasm-owned ECM before STCK discovery and filter
 *  by the actual clip set later. */
export function buildAnimEventMap(ecm: any, animNames?: readonly string[]): Map<string, AnimEvent[]> {
  const animSet = animNames ? new Set(animNames) : null;
  const result = new Map<string, AnimEvent[]>();
  const actionCount: number = ecm.combineActionCount ?? 0;
  for (let i = 0; i < actionCount; i++) {
    const eventCount: number = ecm.combineActionEventCount(i);
    if (eventCount === 0) continue;
    const baseCount: number = ecm.combineActionBaseActionCount(i);
    for (let b = 0; b < baseCount; b++) {
      const baseName: string | undefined = ecm.combineActionBaseActionName(i, b);
      if (!baseName) continue;
      if (animSet && !animSet.has(baseName)) continue;
      // Collect events for this combined action
      const events: AnimEvent[] = [];
      for (let e = 0; e < eventCount; e++) {
        const ev = ecm.getEvent(i, e);
        if (!ev) continue;
        if (ev.event_type !== EVENT_GFX && ev.event_type !== EVENT_SOUND) continue;
        // Keep the full engine path (e.g. "人物\技能\刺客\foo.gfx") — basename
        // alone breaks resolveEnginePath's lookup for assets in nested dirs of
        // gfx.pck. Tooltip wraps long paths visually; resolution needs them.
        events.push({
          type: ev.event_type as typeof EVENT_GFX | typeof EVENT_SOUND,
          filePath: ev.fx_file_path,
          startTime: ev.start_time,
          timeSpan: ev.time_span,
          once: ev.once,
          hookName: ev.hook_name,
          hookOffset: ev.hook_offset,
          hookYaw: ev.hook_yaw,
          hookPitch: ev.hook_pitch,
          hookRot: ev.hook_rot,
          bindParent: ev.bind_parent,
          gfxScale: ev.gfx_scale ?? 1,
          gfxSpeed: ev.gfx_speed ?? 1,
        });
      }
      if (events.length === 0) continue;
      const existing = result.get(baseName);
      if (existing) {
        existing.push(...events);
      } else {
        result.set(baseName, events);
      }
    }
  }
  return result;
}

/** A group of events sharing the same `type` AND the same `startTime`. */
export interface EventCluster {
  type: typeof EVENT_GFX | typeof EVENT_SOUND;
  startTime: number;
  events: AnimEvent[];
}

/**
 * Group consecutive-or-not events with matching `(type, startTime)` into
 * clusters. Preserves source order within each cluster. GFX and Sound events
 * NEVER co-cluster even at identical times — `type` is part of the key.
 *
 * Cluster emission order follows first-occurrence of each key in the input.
 */
export function clusterEvents(events: AnimEvent[]): EventCluster[] {
  const byKey = new Map<string, EventCluster>();
  const order: EventCluster[] = [];
  for (const ev of events) {
    const key = `${ev.type}:${ev.startTime}`;
    let cluster = byKey.get(key);
    if (!cluster) {
      cluster = { type: ev.type, startTime: ev.startTime, events: [] };
      byKey.set(key, cluster);
      order.push(cluster);
    }
    cluster.events.push(ev);
  }
  return order;
}
