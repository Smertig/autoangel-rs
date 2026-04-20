export const EVENT_GFX = 100 as const;
export const EVENT_SOUND = 101 as const;

export interface AnimEvent {
  type: typeof EVENT_GFX | typeof EVENT_SOUND;
  filePath: string; // basename only
  startTime: number; // ms, 0 if not set
  hookName: string; // empty if not set
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
        const evType: number = ecm.eventType(i, e);
        if (evType !== EVENT_GFX && evType !== EVENT_SOUND) continue;
        const rawPath: string = ecm.eventFxFilePath(i, e) ?? '';
        const basePath = rawPath.replace(/\\/g, '/').split('/').pop() ?? rawPath;
        events.push({
          type: evType as 100 | 101,
          filePath: basePath,
          startTime: ecm.eventStartTime(i, e) ?? 0,
          hookName: ecm.eventHookName(i, e) ?? '',
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
