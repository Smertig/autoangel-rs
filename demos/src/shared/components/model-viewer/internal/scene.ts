import { detectEncoding, decodeText } from '@shared/util/encoding';
import { hexDumpRows } from '@shared/util/hex';
import styles from '../ModelViewer.module.css';
import { fitCameraToObject } from './camera-fit';
import { getThree } from './three';
import { getViewer } from './viewer';
import { type AnimEvent, type EventCluster, EVENT_GFX, EVENT_SOUND, clusterEvents } from './event-map';
import type { SkinStats } from './mesh';
import type { GfxEffect } from '../../../../types/autoangel';
import { elementSkipReason } from '../../gfx-runtime/registry';
import type { ElementBodyKind } from '../../gfx/previews/types';
import type { ModelEntryState, ModelStatePorts, Vec3 } from '../state';

/** Toolbar loop-mode toggle states. */
export type LoopMode = 'loop' | 'once' | 'pingpong';
export const LOOP_MODES = ['loop', 'once', 'pingpong'] as const satisfies readonly LoopMode[];

export function showClipToast(container: HTMLElement, message: string): void {
  const existing = container.querySelector('[data-clip-toast]');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = styles.clipToast;
  toast.setAttribute('data-clip-toast', '');
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add(styles.clipToastOut);
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

export interface MountSceneExtras {
  state?: ModelStatePorts;
  /**
   * Async resolver used by the timeline event tooltip to enrich GFX ticks.
   * Returns the parsed `GfxEffect` when the path resolves + loads, or `null`
   * on any failure (unresolved path, fetch error, parse error). Failures
   * degrade silently — the tooltip keeps its base 3-line state.
   */
  lookupGfx?: (filePath: string) => Promise<GfxEffect | null>;
  /**
   * Transport-bar toggle for live GFX rendering. When the box is unchecked,
   * the caller disposes all active runtimes + stops scheduler rebuilds;
   * rechecking rebuilds against the current clip.
   */
  gfxToggle?: {
    kinds: Set<ElementBodyKind>;
    allKinds: readonly ElementBodyKind[];
    onChange: (next: Set<ElementBodyKind>) => void;
  };
  /** Non-fatal notice shown as a chip appended to the bottom-left stats row. */
  warning?: string;
  /**
   * Synchronous resolver: given an animation event, return the canonical
   * in-package path or null when unresolvable. Keeps engine-prefix routing
   * (GFX → `gfx\`, sound → `sound\`) inside the renderer, so the tooltip
   * doesn't need to know about prefix tuples.
   */
  resolveFilePath?: (ev: AnimEvent) => string | null;
  /** Navigate the host shell to the canonical-cased resolved path. */
  onNavigateToFile?: (path: string) => void;
  /**
   * Notifies the caller (render-smd state machine) when the user toggles the
   * loop-mode button. Selected actions always play `LoopOnce`; render-smd
   * uses this preference to decide whether to restart the clip after the
   * GFX tail completes (Loop) or stay in the idle/clamp pose (Once).
   * Ping-pong is currently treated like Once.
   */
  onLoopModeChange?: (mode: LoopMode) => void;
  /**
   * Override the scrubber's read/write of the playback cursor with a
   * "virtual time" abstraction owned by render-smd. The selected action
   * clamps at clipDuration under LoopOnce, so it can't drive the cursor
   * across the GFX tail; render-smd keeps a tail-elapsed counter that
   * lets the cursor traverse the full extended timeline. `seekVirtual`
   * also routes scrub-back through render-smd's state machine so the
   * idle action is stopped and `currentAction` is re-enabled instead of
   * leaving playback stuck in a half-faded state.
   */
  timeOps?: {
    getVirtualTime: () => number;
    seekVirtual: (t: number) => void;
  };
}

export interface MountSceneApi {
  /**
   * Override the duration mapped by the scrubber. Render-smd calls this once
   * per clip switch, after pre-loading all referenced GFX, so the scrubber
   * range covers `max(clipDuration, longestEventEnd)` — the extended timeline
   * that includes the GFX tail. Always clamped to at least the natural clip
   * duration to guard against ordering races (a stale `setTotalDuration` from
   * a previous clip arriving after the new clip is active).
   */
  setTotalDuration: (t: number) => void;
}

export function mountScene(
  container: HTMLElement,
  group: any,
  totalStats: SkinStats,
  sourceData: Uint8Array,
  sourceExt: string,
  animNames?: string[],
  loadClip?: (name: string) => Promise<any>,
  initialClip?: { name: string; clip: any } | null,
  skeleton?: any,
  animEventMap?: Map<string, AnimEvent[]>,
  onClipSwitch?: (clipName: string, action: any) => void,
  extras?: MountSceneExtras,
): MountSceneApi {
  const { THREE, OrbitControls } = getThree();
  const v = getViewer(container);
  v.onFrameUpdate = null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2a2a);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);
  scene.add(group);

  v._disposeScene();
  v.scene = scene;

  const w = container.clientWidth || 400;
  const h = container.clientHeight || 400;
  const { camera, center, size } = fitCameraToObject(THREE, group, w, h);
  v.camera = camera;
  const defaultCamOffset = new THREE.Vector3(size * 0.6, size * 0.5, size * 1.2);

  if (v.controls) v.controls.dispose();
  const controls = new OrbitControls(v.camera, v.renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  v.setControls(controls);
  controls.update();

  // Eager first paint so the model is visible immediately; subsequent frames
  // go through the render-on-demand scheduler.
  v.renderer.render(v.scene, v.camera);

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = styles.modelToolbar;

  const wireBtn = makeToolbarBtn('Wireframe', () => {
    (wireBtn as any)._on = !(wireBtn as any)._on;
    group.traverse((c: any) => { if (c.material) c.material.wireframe = (wireBtn as any)._on; });
    wireBtn.classList.toggle(styles.btnActive, (wireBtn as any)._on);
    v.requestRender();
  });
  toolbar.appendChild(wireBtn);

  const bgBtn = makeToolbarBtn('Light BG', () => {
    (bgBtn as any)._on = !(bgBtn as any)._on;
    scene.background = new THREE.Color((bgBtn as any)._on ? 0xe0e0e0 : 0x2a2a2a);
    bgBtn.classList.toggle(styles.btnActive, (bgBtn as any)._on);
    v.requestRender();
  });
  toolbar.appendChild(bgBtn);

  const resetBtn = makeToolbarBtn('Reset Camera', () => {
    v.camera.position.copy(center).add(defaultCamOffset);
    v.controls.target.copy(center);
    v.controls.update();
    v.requestRender();
  });
  toolbar.appendChild(resetBtn);

  // Skeleton overlay toggle (only if skeleton is available)
  let bonesBtn: HTMLButtonElement | undefined;
  if (skeleton) {
    let skeletonHelper: InstanceType<typeof THREE.SkeletonHelper> | null = null;
    bonesBtn = makeToolbarBtn('Bones', () => {
      (bonesBtn as any)._on = !(bonesBtn as any)._on;
      if ((bonesBtn as any)._on) {
        skeletonHelper = new THREE.SkeletonHelper(group);
        scene.add(skeletonHelper);
      } else if (skeletonHelper) {
        scene.remove(skeletonHelper);
        skeletonHelper.dispose();
        skeletonHelper = null;
      }
      bonesBtn!.classList.toggle(styles.btnActive, (bonesBtn as any)._on);
      v.requestRender();
    });
    toolbar.appendChild(bonesBtn);
  }

  const sep = document.createElement('div');
  sep.className = styles.modelToolbarSep;
  toolbar.appendChild(sep);

  const modeGroup = document.createElement('div');
  modeGroup.className = styles.modelModeGroup;
  const mode3d = makeToolbarBtn('3D', null);
  const modeSrc = makeToolbarBtn('Source', null);
  mode3d.classList.add(styles.btnActive);
  modeGroup.append(mode3d, modeSrc);
  toolbar.appendChild(modeGroup);

  // ── Transport bar (bottom, only when animations exist) ──
  let transport: HTMLElement | null = null;
  let animPanel: HTMLElement | null = null;
  let tooltipEl: HTMLElement | null = null;
  // No-op default: when there is no transport bar (no animations), there is
  // no scrubber to extend. Reassigned below inside the if-block when the
  // transport is built.
  let setTotalDurationExternal: (t: number) => void = () => {};
  if (animNames && animNames.length > 0 && loadClip) {
    transport = document.createElement('div');
    transport.className = styles.transportBar;

    let playing = true;
    let currentSpeed = 1;
    let loopMode = 0;
    const loopModes = [
      { symbol: '\u21BB', title: 'Loop', three: THREE.LoopRepeat },
      { symbol: '\u2192', title: 'Play once', three: THREE.LoopOnce },
      { symbol: '\u21C4', title: 'Ping-pong', three: THREE.LoopPingPong },
    ];

    let activeClip = initialClip ?? { name: animNames[0], clip: null as any };
    const fps = 30;

    // Defaults to the clip's own duration; render-smd extends past clipDur
    // once GFX preload finishes so the user can scrub through the tail.
    let totalDuration = activeClip.clip?.duration ?? 0;
    setTotalDurationExternal = (t: number) => {
      const next = Math.max(t, activeClip.clip?.duration ?? 0);
      if (next === totalDuration) return;
      totalDuration = next;
      redrawScrubberShading();
      // Event tick percentages divide by totalDuration; rebuild so they don't
      // overflow into the (now visible) shaded tail zone.
      rebuildEventLane(activeClip.name);
    };

    function redrawScrubberShading() {
      const clipDur = activeClip.clip?.duration ?? 0;
      const tailFraction = totalDuration > 0
        ? Math.max(0, (totalDuration - clipDur) / totalDuration)
        : 0;
      scrubWrap.style.setProperty('--tail-fraction', tailFraction.toFixed(4));
    }

    function getAction() {
      return v.mixer?.existingAction(activeClip.clip) ?? null;
    }
    function getTime(): number {
      // Render-smd's virtual time covers the post-clip GFX tail
      // (action.time clamps at clipDuration under LoopOnce).
      const fromOps = extras?.timeOps?.getVirtualTime?.();
      if (fromOps !== undefined) return fromOps;
      const action = getAction();
      return action && isFinite(action.time) ? action.time : 0;
    }
    function getDuration(): number {
      return totalDuration;
    }
    function addSep() {
      const s = document.createElement('div');
      s.className = styles.transportSep;
      transport!.appendChild(s);
    }

    // Play button is declared early so pause() and stepFrame() can reference it
    const playBtn = document.createElement('button');
    playBtn.className = styles.transportBtn;
    playBtn.textContent = '\u23F8';
    playBtn.title = 'Play / Pause';

    function pause() {
      playing = false;
      if (v.mixer) v.mixer.timeScale = 0;
      playBtn.textContent = '\u25B6';
      // Render-on-demand: set timeScale=0 before the loop winds down so the
      // final frame renders the paused state correctly.
      v.requestRender();
    }
    function seekTo(t: number) {
      // Bare `action.time = t` leaves a clamped LoopOnce action stuck;
      // render-smd's seekVirtual handles the state-machine reset.
      if (extras?.timeOps?.seekVirtual) {
        extras.timeOps.seekVirtual(t);
        v.requestRender();
        return;
      }
      const action = getAction();
      if (action) action.time = t;
      if (v.mixer) v.mixer.update(0);
      v.requestRender();
    }
    function stepFrame(dir: 1 | -1) {
      if (!v.mixer) return;
      pause();
      const t = dir > 0
        ? Math.min(getDuration(), getTime() + 1 / fps)
        : Math.max(0, getTime() - 1 / fps);
      seekTo(t);
      emitEntryState();
    }

    let applyingInitial = true;
    function emitEntryState() {
      const cb = extras?.state?.onEntryStateChange;
      if (applyingInitial || !cb) return;
      const isPaused = !playing;
      const s: ModelEntryState = { clip: activeClip.name, paused: isPaused };
      // posInClip only meaningful while paused — otherwise playback would
      // emit on every scrubber tick.
      if (isPaused) s.posInClip = getTime();
      s.camera = {
        position: v.camera.position.toArray() as Vec3,
        target: v.controls.target.toArray() as Vec3,
      };
      cb(s);
    }
    function emitFormatState() {
      const cb = extras?.state?.onFormatStateChange;
      if (applyingInitial || !cb) return;
      cb({ speed: currentSpeed, loopMode: LOOP_MODES[loopMode] });
    }

    // Animation list panel
    animPanel = document.createElement('div');
    animPanel.className = styles.animListPanel;

    const animHeader = document.createElement('div');
    animHeader.className = styles.animListHeader;
    const headerLabel = document.createElement('span');
    animHeader.appendChild(headerLabel);
    const updateHeader = (visible: number) => {
      headerLabel.textContent = visible === animNames.length
        ? `Animations (${animNames.length})`
        : `Animations (${visible} / ${animNames.length})`;
    };
    updateHeader(animNames.length);
    animPanel.appendChild(animHeader);

    const animFilter = document.createElement('input');
    animFilter.type = 'text';
    animFilter.placeholder = 'Filter…';
    animFilter.className = styles.animListFilter;
    animPanel.appendChild(animFilter);

    const animScroll = document.createElement('div');
    animScroll.className = styles.animListScroll;
    animPanel.appendChild(animScroll);

    const allItems: Array<{ item: HTMLDivElement; nameLower: string }> = [];
    const applyFilter = () => {
      const q = animFilter.value.trim().toLowerCase();
      let visible = 0;
      for (const { item, nameLower } of allItems) {
        const match = !q || nameLower.includes(q);
        item.style.display = match ? '' : 'none';
        if (match) visible++;
      }
      updateHeader(visible);
    };
    animFilter.addEventListener('input', applyFilter);
    animFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        animFilter.value = '';
        applyFilter();
        animFilter.blur();
      }
    });

    let activeItemEl: HTMLDivElement | undefined;
    let loadGeneration = 0;
    for (const clipName of animNames) {
      const item = document.createElement('div');
      item.className = styles.animListItem;
      item.title = clipName;
      allItems.push({ item, nameLower: clipName.toLowerCase() });

      // Clip name label
      const nameEl = document.createElement('span');
      nameEl.className = styles.animListItemName;
      nameEl.textContent = clipName;
      item.appendChild(nameEl);

      // Small event count indicator (details shown in timeline ticks)
      const events = animEventMap?.get(clipName);
      if (events && events.length > 0) {
        const gfxCount = events.filter(e => e.type === EVENT_GFX).length;
        const sndCount = events.filter(e => e.type === EVENT_SOUND).length;
        const indicator = document.createElement('span');
        indicator.className = styles.animEventIndicator;
        const parts: string[] = [];
        if (gfxCount > 0) parts.push(`\u2726${gfxCount}`);
        if (sndCount > 0) parts.push(`\u266A${sndCount}`);
        indicator.textContent = parts.join(' ');
        nameEl.appendChild(indicator);
      }

      if (initialClip && clipName === initialClip.name) {
        item.classList.add(styles.animListItemActive);
        activeItemEl = item;
      }
      item.onclick = async () => {
        if (!v.mixer || item.classList.contains(styles.animListItemLoading)) return;
        const gen = ++loadGeneration;
        item.classList.remove(styles.animListItemFailed);
        item.title = clipName;
        item.classList.add(styles.animListItemLoading);
        try {
          const clip = await loadClip!(clipName);
          if (gen !== loadGeneration) return;
          v.mixer.stopAllAction();
          activeClip = { name: clipName, clip };
          // Reset scrubber range to the new clip's natural duration; render-
          // smd will extend it via setTotalDurationExternal once preload
          // finishes (the Math.max in the setter guards ordering).
          totalDuration = activeClip.clip?.duration ?? 0;
          redrawScrubberShading();
          const action = v.mixer.clipAction(clip);
          // Render-smd drives looping itself so it can interleave a GFX tail.
          action.loop = THREE.LoopOnce;
          action.clampWhenFinished = true;
          action.play();
          if (!playing) v.mixer.timeScale = 0;
          v.requestRender();
          if (activeItemEl) activeItemEl.classList.remove(styles.animListItemActive);
          item.classList.add(styles.animListItemActive);
          activeItemEl = item;
          rebuildEventLane(clipName);
          onClipSwitch?.(clipName, action);
          emitEntryState();
        } catch (e) {
          if (gen !== loadGeneration) return;
          console.warn('[model] Failed to load clip:', clipName, e);
          const msg = e instanceof Error ? e.message : 'Failed to load animation';
          item.classList.add(styles.animListItemFailed);
          item.title = `${clipName} — ${msg} (click to retry)`;
          showClipToast(container, msg);
        } finally {
          item.classList.remove(styles.animListItemLoading);
        }
      };
      animScroll.appendChild(item);
    }

    if (activeItemEl) requestAnimationFrame(() => activeItemEl!.scrollIntoView({ block: 'nearest' }));

    // Prev frame
    const prevBtn = document.createElement('button');
    prevBtn.className = styles.transportBtn;
    prevBtn.textContent = '\u23EE';
    prevBtn.title = 'Previous frame';
    prevBtn.onclick = () => stepFrame(-1);
    transport.appendChild(prevBtn);

    // Play/Pause
    playBtn.onclick = () => {
      playing = !playing;
      if (v.mixer) v.mixer.timeScale = playing ? currentSpeed : 0;
      playBtn.textContent = playing ? '\u23F8' : '\u25B6';
      // Kick the render loop: playing → it self-sustains via isMixerActive;
      // pausing → one trailing frame renders the halted pose, then idle.
      v.requestRender();
      emitEntryState();
    };
    transport.appendChild(playBtn);

    // Next frame
    const nextBtn = document.createElement('button');
    nextBtn.className = styles.transportBtn;
    nextBtn.textContent = '\u23ED';
    nextBtn.title = 'Next frame';
    nextBtn.onclick = () => stepFrame(1);
    transport.appendChild(nextBtn);
    addSep();

    // Scrubber + event timeline
    let scrubbing = false;
    const scrubWrap = document.createElement('div');
    scrubWrap.className = styles.scrubberWrap;

    const eventLane = document.createElement('div');
    eventLane.className = styles.eventLane;
    scrubWrap.appendChild(eventLane);

    const scrubber = document.createElement('input');
    scrubber.type = 'range';
    scrubber.className = styles.scrubber;
    scrubber.min = '0';
    scrubber.max = '1000';
    scrubber.value = '0';
    scrubber.onpointerdown = (e) => { scrubbing = true; scrubber.setPointerCapture(e.pointerId); };
    scrubber.onpointerup = () => { scrubbing = false; };
    scrubber.onpointercancel = () => { scrubbing = false; };
    scrubber.oninput = () => {
      if (!v.mixer) return;
      const t = (Number(scrubber.value) / 1000) * getDuration();
      seekTo(t);
    };
    // Persist on release (or single-click) while paused — `oninput` would
    // emit per drag tick and swamp the host with re-renders.
    scrubber.onchange = () => {
      if (!playing) emitEntryState();
    };
    scrubWrap.appendChild(scrubber);
    transport.appendChild(scrubWrap);
    redrawScrubberShading();

    // Shared tooltip element — added to container via replaceChildren to survive mode switches
    const tooltip = document.createElement('div');
    tooltip.className = styles.eventTooltip;
    tooltipEl = tooltip;

    // Per-row tokens — bumped on every show/hide so slow async GFX lookups
    // can't clobber a newer hover target. Each cluster row gets its own slot
    // so a fast lookup isn't blocked by a slower sibling.
    let tooltipRowTokens: number[] = [];

    const MAX_ROWS_VISIBLE = 4;

    function appendGfxMeta(row: HTMLElement, ev: AnimEvent, tokenIndex: number) {
      if (!extras?.lookupGfx) return;
      const expected = tooltipRowTokens[tokenIndex];
      extras.lookupGfx(ev.filePath)
        .then((gfx) => {
          if (tooltipRowTokens[tokenIndex] !== expected) return; // stale
          if (!gfx) {
            // Loader returned null — path not in any loaded package, fetch
            // failed, or parse failed. The full file path is already shown
            // above; the user can compare it to what's actually in their
            // packages. Console has the detail.
            const note = document.createElement('div');
            note.className = `${styles.eventTooltipDetail} ${styles.eventTooltipUnresolved}`;
            note.textContent = 'unable to load';
            row.appendChild(note);
            return;
          }
          const elements = gfx.elements ?? [];
          const kindCounts = new Map<string, number>();
          const skipCounts = new Map<string, number>();
          for (const el of elements) {
            const k = el.body?.kind ?? 'unknown';
            kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1);
            const skip = elementSkipReason(el);
            if (skip) skipCounts.set(skip, (skipCounts.get(skip) ?? 0) + 1);
          }
          const kindStr = [...kindCounts.entries()]
            .map(([k, n]) => `${n} ${k}`)
            .join(' · ');

          const meta = document.createElement('div');
          meta.className = styles.eventTooltipDetail;
          meta.textContent = elements.length === 0
            ? '0 elements'
            : `${elements.length} element${elements.length === 1 ? '' : 's'}: ${kindStr}`;
          row.appendChild(meta);

          if (skipCounts.size > 0) {
            const skipStr = [...skipCounts.entries()]
              .map(([k, n]) => `${n} ${k}`)
              .join(' · ');
            const skip = document.createElement('div');
            skip.className = styles.eventTooltipSkipped;
            skip.textContent = `skipped: ${skipStr}`;
            row.appendChild(skip);
          }

          const ver = document.createElement('div');
          ver.className = styles.eventTooltipDetail;
          ver.textContent = `v${gfx.version} · scale ${gfx.default_scale.toFixed(2)} · speed ${gfx.play_speed.toFixed(2)} · alpha ${gfx.default_alpha.toFixed(2)}`;
          row.appendChild(ver);
        })
        .catch(() => { /* swallow — tooltip stays at base state */ });
    }

    function appendEventRow(ev: AnimEvent, tokenIndex: number) {
      const row = document.createElement('div');
      row.className = styles.eventTooltipRow;

      // Resolver is delegated to the caller — scene.ts shouldn't know about
      // engine-prefix routing. Unresolvable paths stay plain text.
      const resolvedPath = extras?.resolveFilePath?.(ev) ?? null;
      const navigable = resolvedPath !== null && !!extras?.onNavigateToFile;

      const file = document.createElement('div');
      file.className = navigable
        ? `${styles.eventTooltipFile} ${styles.eventTooltipFileNav}`
        : styles.eventTooltipFile;

      const pathSpan = document.createElement('span');
      pathSpan.className = styles.eventTooltipFilePath;
      pathSpan.textContent = ev.filePath;
      file.appendChild(pathSpan);

      if (navigable) {
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = styles.eventTooltipOpenBtn;
        openBtn.title = `Open ${resolvedPath}`;
        openBtn.setAttribute('aria-label', `Open ${resolvedPath}`);
        openBtn.textContent = '↗';
        const go = (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          extras!.onNavigateToFile!(resolvedPath!);
        };
        openBtn.addEventListener('click', go);
        openBtn.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') go(e);
        });
        file.appendChild(openBtn);
      }

      row.appendChild(file);

      // Resolved path — only shown when the mapping is non-obvious. If
      // the resolved path is just the raw one with a known prefix (the
      // common case: `gfx\` + raw), the user can already infer it, and
      // repeating it per-row bloats cluster tooltips with duplicated noise.
      // Surfaced only when case differs or the tail diverged.
      const resolvedTail =
        resolvedPath !== null &&
        resolvedPath.length > ev.filePath.length &&
        resolvedPath.toLowerCase().endsWith(ev.filePath.toLowerCase());
      if (resolvedPath !== null && !resolvedTail) {
        const resolved = document.createElement('div');
        resolved.className = styles.eventTooltipResolved;
        resolved.textContent = `↪ ${resolvedPath}`;
        row.appendChild(resolved);
      }

      if (ev.hookName) {
        const hook = document.createElement('div');
        hook.className = styles.eventTooltipDetail;
        hook.textContent = `hook: ${ev.hookName}`;
        row.appendChild(hook);
      }

      if (ev.type === EVENT_GFX) appendGfxMeta(row, ev, tokenIndex);

      tooltip.appendChild(row);
    }

    function showTooltip(tick: HTMLElement, cluster: EventCluster) {
      const isGfx = cluster.type === EVENT_GFX;
      const count = cluster.events.length;
      const typeClass = isGfx ? styles.eventTooltipGfx : styles.eventTooltipSound;
      const clusterClass = count > 1 ? ` ${styles.eventTooltipCluster}` : '';
      tooltip.className = `${styles.eventTooltip} ${typeClass}${clusterClass} ${styles.eventTooltipVisible}`;
      tooltip.innerHTML = '';

      // Header — "✦ GFX" alone, or "✦ GFX · ×N" for clusters.
      const header = document.createElement('div');
      header.className = styles.eventTooltipHeader;
      const prefix = isGfx ? '✦ GFX' : '♪ Sound';
      header.textContent = count > 1 ? `${prefix} · ×${count}` : prefix;
      tooltip.appendChild(header);

      // Shared time annotation for the whole cluster.
      if (cluster.startTime > 0) {
        const time = document.createElement('div');
        time.className = styles.eventTooltipDetail;
        time.textContent = `@ ${cluster.startTime}ms`;
        tooltip.appendChild(time);
      }

      // Fresh row-token array — any dangling resolves from a prior hover are
      // now stale because their stored `expected` no longer matches any slot.
      tooltipRowTokens = [];
      const visibleCount = count > MAX_ROWS_VISIBLE ? MAX_ROWS_VISIBLE - 1 : count;
      for (let i = 0; i < visibleCount; i++) {
        if (i > 0) {
          const sep = document.createElement('div');
          sep.className = styles.eventTooltipRowSeparator;
          tooltip.appendChild(sep);
        }
        tooltipRowTokens.push(i);
        appendEventRow(cluster.events[i], i);
      }
      if (count > MAX_ROWS_VISIBLE) {
        const more = document.createElement('div');
        more.className = styles.eventTooltipMore;
        more.textContent = `…and ${count - visibleCount} more`;
        tooltip.appendChild(more);
      }

      // Position above the tick, in container coordinates.
      const containerRect = container.getBoundingClientRect();
      const tickRect = tick.getBoundingClientRect();
      const tickCenterX = tickRect.left + tickRect.width / 2 - containerRect.left;
      const tipWidth = count > 1 ? 260 : 200;
      let left = tickCenterX - tipWidth / 2;
      left = Math.max(4, Math.min(left, containerRect.width - tipWidth - 4));
      tooltip.style.left = `${left}px`;
      tooltip.style.bottom = `${containerRect.bottom - tickRect.top + 4}px`;
    }

    function hideTooltip() {
      // Discard any in-flight row lookups — clearing the slot array makes
      // every `expected === tooltipRowTokens[i]` check fail (undefined !== N).
      tooltipRowTokens = [];
      tooltip.classList.remove(styles.eventTooltipVisible);
    }

    // Hover-bridge: deferred hide so the mouse can travel from tick → tooltip
    // (and back, while reading or selecting text) without losing the tooltip.
    let hideTimer: number | null = null;
    function scheduleHide() {
      cancelHide();
      hideTimer = window.setTimeout(() => { hideTimer = null; hideTooltip(); }, 120);
    }
    function cancelHide() {
      if (hideTimer != null) { clearTimeout(hideTimer); hideTimer = null; }
    }
    tooltip.addEventListener('mouseenter', cancelHide);
    tooltip.addEventListener('mouseleave', scheduleHide);

    /** Rebuild event tick marks on the timeline lane for the given clip. */
    function rebuildEventLane(clipName: string) {
      eventLane.replaceChildren();
      hideTooltip();
      const events = animEventMap?.get(clipName);
      const dur = getDuration();
      if (!events || events.length === 0 || dur <= 0) return;
      const clusters = clusterEvents(events);
      for (const cluster of clusters) {
        const pct = Math.min(100, Math.max(0, (cluster.startTime / 1000) / dur * 100));
        const isGfx = cluster.type === EVENT_GFX;
        const tick = document.createElement('div');
        const baseClass = isGfx ? styles.eventTickGfx : styles.eventTickSound;
        tick.className = cluster.events.length > 1
          ? `${baseClass} ${styles.eventTickCluster}`
          : baseClass;
        tick.style.left = `${pct}%`;
        if (cluster.events.length > 1) {
          const badge = document.createElement('span');
          badge.className = styles.eventTickCountBadge;
          badge.textContent = cluster.events.length >= 10 ? '…' : String(cluster.events.length);
          tick.appendChild(badge);
        }
        tick.onmouseenter = () => { cancelHide(); showTooltip(tick, cluster); };
        tick.onmouseleave = scheduleHide;
        eventLane.appendChild(tick);
      }
    }
    rebuildEventLane(activeClip.name);

    // Time display
    const timeEl = document.createElement('span');
    timeEl.className = styles.timeDisplay;
    timeEl.textContent = '0.00s / 0.00s';
    transport.appendChild(timeEl);
    addSep();

    const SPEED_MIN = 0.25;
    const SPEED_MAX = 4;
    const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4];
    const SNAP_TOLERANCE_PCT = 0.02;
    const SPEED_LOG_MIN = Math.log(SPEED_MIN);
    const SPEED_LOG_RANGE = Math.log(SPEED_MAX) - SPEED_LOG_MIN;
    const speedToFraction = (s: number) => (Math.log(s) - SPEED_LOG_MIN) / SPEED_LOG_RANGE;
    const fractionToSpeed = (f: number) => Math.exp(f * SPEED_LOG_RANGE + SPEED_LOG_MIN);
    const SPEED_PRESET_FRACTIONS = SPEED_PRESETS.map(speedToFraction);

    const speedWrap = document.createElement('div');
    speedWrap.className = `${styles.speedWrap} ${styles.speedAtDefault}`;
    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.className = styles.speedSlider;
    speedSlider.min = '0';
    speedSlider.max = '1';
    speedSlider.step = 'any';
    speedSlider.value = String(speedToFraction(1));
    speedSlider.title = 'Playback speed (double-click to reset)';

    const speedLabel = document.createElement('span');
    speedLabel.className = styles.speedLabel;
    speedLabel.textContent = '1.0×';

    function applySpeed(spd: number) {
      let next = Math.max(SPEED_MIN, Math.min(SPEED_MAX, spd));
      // Snap to a preset when the user lands within tolerance — keeps "1×"
      // selectable without needing to be pixel-perfect. Reset/wheel/init
      // paths already pass exact preset values, so snapping is a no-op for
      // them.
      const f = speedToFraction(next);
      for (let i = 0; i < SPEED_PRESETS.length; i++) {
        if (Math.abs(SPEED_PRESET_FRACTIONS[i] - f) < SNAP_TOLERANCE_PCT) {
          next = SPEED_PRESETS[i];
          break;
        }
      }
      if (next === currentSpeed) return;
      currentSpeed = next;
      speedSlider.value = String(speedToFraction(currentSpeed));
      speedLabel.textContent = `${currentSpeed >= 1 ? currentSpeed.toFixed(1) : currentSpeed.toFixed(2)}×`;
      speedSlider.style.setProperty('--speed-fill', `${speedToFraction(currentSpeed) * 100}%`);
      speedWrap.classList.toggle(styles.speedAtDefault, currentSpeed === 1);
      if (v.mixer && playing) {
        v.mixer.timeScale = currentSpeed;
        v.requestRender();
      }
      emitFormatState();
    }

    speedSlider.oninput = () => applySpeed(fractionToSpeed(Number(speedSlider.value)));
    speedSlider.ondblclick = () => applySpeed(1);
    speedSlider.addEventListener('wheel', (e) => {
      e.preventDefault();
      // One wheel notch = half an octave (multiply / divide by sqrt(2)).
      const dir = e.deltaY > 0 ? -1 : 1;
      applySpeed(currentSpeed * Math.pow(2, dir * 0.5));
    }, { passive: false });

    speedWrap.appendChild(speedSlider);
    speedWrap.appendChild(speedLabel);
    transport.appendChild(speedWrap);
    addSep();

    // Loop mode
    const loopBtn = document.createElement('button');
    loopBtn.className = `${styles.transportBtn} ${styles.transportBtnActive}`;
    loopBtn.textContent = loopModes[0].symbol;
    loopBtn.title = loopModes[0].title;
    loopBtn.onclick = () => {
      loopMode = (loopMode + 1) % loopModes.length;
      loopBtn.textContent = loopModes[loopMode].symbol;
      loopBtn.title = loopModes[loopMode].title;
      const action = getAction();
      if (action) {
        // render-smd drives looping itself; the loop_modes labels are display-only.
        action.loop = THREE.LoopOnce;
        action.clampWhenFinished = true;
      }
      const modeName: LoopMode = LOOP_MODES[loopMode];
      extras?.onLoopModeChange?.(modeName);
      emitFormatState();
    };
    transport.appendChild(loopBtn);

    // GFX render filter — popover lets the user enable/disable spawning per
    // ElementBody kind (e.g. "decals only" while debugging the runtime).
    if (extras?.gfxToggle) {
      addSep();
      const toggle = extras.gfxToggle;
      const allKinds = toggle.allKinds;
      let enabled: Set<ElementBodyKind> = new Set(toggle.kinds);

      const wrap = document.createElement('div');
      wrap.className = styles.gfxToggle;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = styles.gfxFilterButton;
      button.title = 'Filter which GFX element kinds render';
      const updateLabel = () => {
        const n = enabled.size;
        const total = allKinds.length;
        const status = n === 0 ? 'off' : n === total ? 'all' : `${n}/${total}`;
        button.textContent = `Render GFX (${status}) ▾`;
      };
      updateLabel();
      wrap.appendChild(button);

      const popover = document.createElement('div');
      popover.className = styles.gfxFilterPopover;
      popover.hidden = true;

      const headerRow = document.createElement('div');
      headerRow.className = styles.gfxFilterHeader;
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.textContent = 'All';
      const noneBtn = document.createElement('button');
      noneBtn.type = 'button';
      noneBtn.textContent = 'None';
      headerRow.appendChild(allBtn);
      headerRow.appendChild(noneBtn);
      popover.appendChild(headerRow);

      const itemByKind = new Map<ElementBodyKind, HTMLInputElement>();
      const list = document.createElement('div');
      list.className = styles.gfxFilterList;
      for (const kind of allKinds) {
        const row = document.createElement('label');
        row.className = styles.gfxFilterItem;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = enabled.has(kind);
        cb.addEventListener('change', () => {
          if (cb.checked) enabled.add(kind);
          else enabled.delete(kind);
          updateLabel();
          toggle.onChange(new Set(enabled));
        });
        row.appendChild(cb);
        row.appendChild(document.createTextNode(' ' + kind));
        list.appendChild(row);
        itemByKind.set(kind, cb);
      }
      popover.appendChild(list);

      const setAll = (on: boolean) => {
        enabled = new Set(on ? allKinds : []);
        for (const [kind, cb] of itemByKind) cb.checked = enabled.has(kind);
        updateLabel();
        toggle.onChange(new Set(enabled));
      };
      allBtn.addEventListener('click', () => setAll(true));
      noneBtn.addEventListener('click', () => setAll(false));

      const closeOnOutside = (ev: MouseEvent) => {
        // Self-clean if the popover got torn down (viewer dispose, container
        // emptied) — without this, switching models with the popover open
        // leaks the listener (and its closure) on `document`.
        if (!wrap.isConnected) {
          document.removeEventListener('mousedown', closeOnOutside);
          return;
        }
        if (!wrap.contains(ev.target as Node)) {
          popover.hidden = true;
          document.removeEventListener('mousedown', closeOnOutside);
        }
      };
      button.addEventListener('click', () => {
        popover.hidden = !popover.hidden;
        if (!popover.hidden) {
          document.addEventListener('mousedown', closeOnOutside);
        } else {
          document.removeEventListener('mousedown', closeOnOutside);
        }
      });

      wrap.appendChild(popover);
      transport.appendChild(wrap);
    }

    // Per-frame update with change guard to avoid no-op DOM writes
    let prevScrubVal = -1;
    v.onFrameUpdate = () => {
      if (scrubbing) return;
      const t = getTime();
      const dur = getDuration();
      const scrubVal = dur > 0 ? Math.round((t / dur) * 1000) : 0;
      if (scrubVal === prevScrubVal) return;
      prevScrubVal = scrubVal;
      scrubber.value = String(scrubVal);
      const pct = (scrubVal / 10);
      scrubber.style.background = `linear-gradient(to right, rgba(123,164,232,0.5) ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
      timeEl.textContent = `${t.toFixed(2)}s / ${dur.toFixed(2)}s`;
    };

    const initialFmt = extras?.state?.initialFormatState;
    if (initialFmt?.speed !== undefined) applySpeed(initialFmt.speed);
    if (initialFmt?.loopMode) {
      const idx = LOOP_MODES.indexOf(initialFmt.loopMode);
      if (idx >= 0 && idx !== loopMode) {
        loopMode = idx;
        loopBtn.textContent = loopModes[loopMode].symbol;
        loopBtn.title = loopModes[loopMode].title;
      }
    }
    const initialEntry = extras?.state?.initialEntryState;
    if (initialEntry?.paused === true) {
      pause();
      // Only seek when the persisted clip matches what's actually loaded —
      // posInClip is meaningless against a different animation.
      if (initialEntry.posInClip !== undefined && initialEntry.clip === activeClip.name) {
        seekTo(initialEntry.posInClip);
      }
    }
    if (initialEntry?.camera) {
      v.camera.position.fromArray(initialEntry.camera.position);
      v.controls.target.fromArray(initialEntry.camera.target);
      v.controls.update();
      v.requestRender();
    }
    // Persist on user-driven orbit/pan/zoom release. `change` fires per drag
    // tick; `end` fires once on pointer release — same idiom as the scrubber.
    v.controls.addEventListener('end', emitEntryState);
    applyingInitial = false;
  }

  const info = document.createElement('div');
  info.className = transport
    ? `${styles.modelInfo} ${styles.modelInfoAboveTransport}`
    : styles.modelInfo;
  info.innerHTML =
    `<span>${totalStats.meshes} mesh${totalStats.meshes !== 1 ? 'es' : ''}</span>` +
    `<span>${totalStats.verts.toLocaleString()} verts</span>` +
    `<span>${Math.round(totalStats.tris).toLocaleString()} tris</span>` +
    `<span>${totalStats.textures} tex</span>`;

  if (extras?.warning) {
    const warnChip = document.createElement('span');
    warnChip.className = styles.modelInfoWarn;
    warnChip.textContent = 'guessed skin';
    warnChip.title = extras.warning;
    info.appendChild(warnChip);
  }

  // Source view (lazy-built)
  let sourceEl: HTMLElement | null = null;
  function getSourceEl(): HTMLElement {
    if (sourceEl) return sourceEl;
    sourceEl = document.createElement('div');
    sourceEl.className = styles.modelSource;
    if (sourceData && (sourceExt === '.ecm' || sourceExt === '.gfx')) {
      const encoding = detectEncoding(sourceData);
      const text = decodeText(sourceData, encoding);
      const pre = document.createElement('pre');
      pre.textContent = text;
      sourceEl.appendChild(pre);
    } else if (sourceData) {
      sourceEl.appendChild(buildHexDump(sourceData));
    }
    return sourceEl;
  }

  const canvas = v.renderer.domElement;

  mode3d.onclick = () => {
    mode3d.classList.add(styles.btnActive);
    modeSrc.classList.remove(styles.btnActive);
    const children: Node[] = [canvas, toolbar, info];
    if (transport) children.push(transport);
    if (animPanel) children.push(animPanel);
    if (tooltipEl) children.push(tooltipEl);
    container.replaceChildren(...children);
    wireBtn.style.display = bgBtn.style.display = resetBtn.style.display = '';
    if (bonesBtn) bonesBtn.style.display = '';
  };
  modeSrc.onclick = () => {
    modeSrc.classList.add(styles.btnActive);
    mode3d.classList.remove(styles.btnActive);
    container.replaceChildren(getSourceEl(), toolbar);
    wireBtn.style.display = bgBtn.style.display = resetBtn.style.display = 'none';
    if (bonesBtn) bonesBtn.style.display = 'none';
  };

  const children: Node[] = [canvas, toolbar, info];
  if (transport) children.push(transport);
  if (animPanel) children.push(animPanel);
  if (tooltipEl) children.push(tooltipEl);
  container.replaceChildren(...children);

  return { setTotalDuration: (t: number) => setTotalDurationExternal(t) };
}

export function makeToolbarBtn(label: string, onclick: (() => void) | null): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = styles.btn;
  btn.textContent = label;
  (btn as any)._on = false;
  if (onclick) btn.onclick = onclick;
  return btn;
}

export function buildHexDump(data: Uint8Array): HTMLPreElement {
  const rows = hexDumpRows(data);
  const lines = rows.map((r) => `${r.offset}  ${r.hex}  ${r.ascii}`);
  if (data.length > 4096) lines.push(`\n... (${data.length.toLocaleString()} bytes total)`);
  const pre = document.createElement('pre');
  pre.className = styles.hexDump;
  pre.textContent = lines.join('\n');
  return pre;
}
