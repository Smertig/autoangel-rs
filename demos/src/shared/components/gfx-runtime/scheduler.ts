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
  /**
   * Register an externally-spawned runtime so it participates in ticking and
   * disposal. Needed because GFX resolution is async: the `spawn` callback
   * returns a synchronous placeholder, and the resolved real runtime(s) are
   * attached later once their files have loaded.
   */
  attachRuntime(rt: GfxElementRuntime): void;
  /** Tear down everything (clip change or viewer unmount). */
  disposeAll(): void;
  /** Test-only: number of currently-active runtimes. */
  _activeCount(): number;
  /** Test-only: cumulative spawn-callback invocations. Survives noops that
   *  finish on the same frame they spawn (`_activeCount` doesn't). */
  _eventsFired(): number;
  /** Diagnostics: snapshot of currently-active runtimes (read-only). */
  _activeRuntimes(): readonly GfxElementRuntime[];
}

export function createGfxEventScheduler(args: SchedulerArgs): GfxEventScheduler {
  // Sentinel "before any possible startTime" so events at startTime=0 fire
  // on the first tick. Many ECMs place skill effects at t=0; without this,
  // `last < startSec` is `0 < 0` and the event silently never fires.
  let last = -Infinity;
  const firedOnce = new Set<AnimEvent>();
  const active: GfxElementRuntime[] = [];
  let firedCount = 0;

  return {
    tickToClipTime(t) {
      for (const ev of args.events) {
        if (firedOnce.has(ev)) continue;
        const startSec = ev.startTime / 1000;
        if (last < startSec && startSec <= t) {
          active.push(args.spawn(ev));
          firedCount++;
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
      // Reset to the same "before any possible startTime" sentinel as init
      // so events at startTime=0 re-fire on the next iteration's first tick.
      last = -Infinity;
      // Non-once events auto-eligible — firedOnce only retains once=true.
    },
    attachRuntime(rt) {
      active.push(rt);
    },
    disposeAll() {
      while (active.length > 0) active.pop()!.dispose();
    },
    _activeCount() {
      return active.length;
    },
    _eventsFired() {
      return firedCount;
    },
    _activeRuntimes() {
      // Snapshot — caller mutating the array (or iterating during a tick
      // that itself mutates `active`) must not corrupt scheduler state.
      return [...active];
    },
  };
}
