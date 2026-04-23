import { detectEncoding, decodeText } from '@shared/util/encoding';
import { hexDumpRows } from '@shared/util/hex';
import styles from '../ModelViewer.module.css';
import { getThree } from './three';
import { getViewer } from './viewer';
import { type AnimEvent, type EventCluster, EVENT_GFX, EVENT_SOUND, clusterEvents } from './event-map';
import type { SkinStats } from './mesh';
import type { GfxEffect } from '../../../../types/autoangel';

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
  gfxToggle?: { enabled: boolean; onChange: (next: boolean) => void };
  /** Non-fatal notice shown as a chip appended to the bottom-left stats row. */
  warning?: string;
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
): void {
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

  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const defaultCamOffset = new THREE.Vector3(size * 0.6, size * 0.5, size * 1.2);

  v._disposeScene();
  v.scene = scene;

  const w = container.clientWidth || 400;
  const h = container.clientHeight || 400;
  v.camera = new THREE.PerspectiveCamera(40, w / h, size * 0.001, size * 20);
  v.camera.position.copy(center).add(defaultCamOffset);

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

    function getAction() {
      return v.mixer?.existingAction(activeClip.clip) ?? null;
    }
    function getTime(): number {
      const action = getAction();
      return action && isFinite(action.time) ? action.time : 0;
    }
    function getDuration(): number {
      return activeClip.clip?.duration ?? 0;
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
    }

    // Animation list panel
    animPanel = document.createElement('div');
    animPanel.className = styles.animListPanel;

    const animHeader = document.createElement('div');
    animHeader.className = styles.animListHeader;
    animHeader.textContent = `Animations (${animNames.length})`;
    animPanel.appendChild(animHeader);

    const animScroll = document.createElement('div');
    animScroll.className = styles.animListScroll;
    animPanel.appendChild(animScroll);

    let activeItemEl: HTMLDivElement | undefined;
    let loadGeneration = 0;
    for (const clipName of animNames) {
      const item = document.createElement('div');
      item.className = styles.animListItem;
      item.title = clipName;

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
          const action = v.mixer.clipAction(clip);
          action.loop = loopModes[loopMode].three;
          action.clampWhenFinished = loopModes[loopMode].three === THREE.LoopOnce;
          action.play();
          if (!playing) v.mixer.timeScale = 0;
          v.requestRender();
          if (activeItemEl) activeItemEl.classList.remove(styles.animListItemActive);
          item.classList.add(styles.animListItemActive);
          activeItemEl = item;
          rebuildEventLane(clipName);
          onClipSwitch?.(clipName, action);
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
      if (playing) pause();
      seekTo(t);
    };
    scrubWrap.appendChild(scrubber);
    transport.appendChild(scrubWrap);

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
          for (const el of elements) {
            const k = el.body?.kind ?? 'unknown';
            kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1);
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

      const file = document.createElement('div');
      file.className = styles.eventTooltipFile;
      file.textContent = ev.filePath;
      row.appendChild(file);

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

    // Speed buttons
    const speeds: [string, number][] = [['0.5x', 0.5], ['1x', 1], ['2x', 2]];
    const speedBtns: HTMLButtonElement[] = [];
    for (const [label, spd] of speeds) {
      const btn = document.createElement('button');
      btn.className = styles.speedBtn;
      btn.textContent = label;
      btn.onclick = () => {
        currentSpeed = spd;
        if (v.mixer && playing) {
          v.mixer.timeScale = spd;
          v.requestRender();
        }
        speedBtns.forEach((b, i) => b.classList.toggle(styles.transportBtnActive, speeds[i][1] === spd));
      };
      speedBtns.push(btn);
      transport.appendChild(btn);
    }
    speedBtns[1]?.classList.add(styles.transportBtnActive);
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
        action.loop = loopModes[loopMode].three;
        action.clampWhenFinished = loopModes[loopMode].three === THREE.LoopOnce;
      }
    };
    transport.appendChild(loopBtn);

    // GFX render toggle — A/B compare clips with effects on vs. off
    if (extras?.gfxToggle) {
      addSep();
      const toggleLabel = document.createElement('label');
      toggleLabel.className = styles.gfxToggle;
      toggleLabel.title = 'Render GFX effects referenced by animation events';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = extras.gfxToggle.enabled;
      cb.onchange = () => extras.gfxToggle!.onChange(cb.checked);
      toggleLabel.appendChild(cb);
      toggleLabel.appendChild(document.createTextNode(' Render GFX'));
      transport.appendChild(toggleLabel);
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
