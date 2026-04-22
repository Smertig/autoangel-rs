import type { AnimEvent } from '../model-viewer/internal/event-map';
import type { GfxElementRuntime } from './types';

interface SchedulerArgs {
  events: AnimEvent[];
  spawn: (ev: AnimEvent) => GfxElementRuntime;
  bones: any[];
  sceneRoot: any;
}

export interface GfxEventScheduler {
  /** Advance clip-time cursor (seconds); fires any events newly crossed. */
  tickToClipTime(tSec: number): void;
  /** Per-frame dt advance for active runtimes; disposes any that report finished. */
  tickRuntimes(dtSec: number): void;
  /** Mark a loop boundary — non-once events become re-eligible. */
  onLoop(): void;
  /** Tear down everything (clip change or viewer unmount). */
  disposeAll(): void;
}

export function createGfxEventScheduler(args: SchedulerArgs): GfxEventScheduler {
  let last = 0;
  const firedOnce = new Set<AnimEvent>();
  const active: GfxElementRuntime[] = [];

  return {
    tickToClipTime(t) {
      for (const ev of args.events) {
        if (firedOnce.has(ev)) continue;
        const startSec = ev.startTime / 1000;
        if (last < startSec && startSec <= t) {
          active.push(args.spawn(ev));
          if (ev.once) firedOnce.add(ev);
        }
      }
      last = t;
    },
    tickRuntimes(dt) {
      for (let i = active.length - 1; i >= 0; i--) {
        const rt = active[i];
        rt.tick(dt);
        if (rt.finished?.()) {
          rt.dispose();
          active.splice(i, 1);
        }
      }
    },
    onLoop() {
      last = 0;
      // Non-once events auto-eligible — firedOnce only retains once=true.
    },
    disposeAll() {
      while (active.length > 0) active.pop()!.dispose();
    },
  };
}
