export const EVENT_GFX = 100 as const;
export const EVENT_SOUND = 101 as const;

export interface AnimEvent {
  type: typeof EVENT_GFX | typeof EVENT_SOUND;
  filePath: string; // basename only
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

/** Build a map from STCK animation name stem → events from ECM combined actions. */
export function buildAnimEventMap(ecm: any, animNames: string[]): Map<string, AnimEvent[]> {
  const animSet = new Set(animNames);
  const result = new Map<string, AnimEvent[]>();
  const actionCount: number = ecm.combineActionCount ?? 0;
  for (let i = 0; i < actionCount; i++) {
    const eventCount: number = ecm.combineActionEventCount(i);
    if (eventCount === 0) continue;
    const baseCount: number = ecm.combineActionBaseActionCount(i);
    for (let b = 0; b < baseCount; b++) {
      const baseName: string | undefined = ecm.combineActionBaseActionName(i, b);
      if (!baseName || !animSet.has(baseName)) continue;
      // Collect events for this combined action
      const events: AnimEvent[] = [];
      for (let e = 0; e < eventCount; e++) {
        const ev = ecm.getEvent(i, e);
        if (!ev) continue;
        if (ev.event_type !== EVENT_GFX && ev.event_type !== EVENT_SOUND) continue;
        const basePath = ev.fx_file_path.replace(/\\/g, '/').split('/').pop() ?? ev.fx_file_path;
        events.push({
          type: ev.event_type as typeof EVENT_GFX | typeof EVENT_SOUND,
          filePath: basePath,
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
