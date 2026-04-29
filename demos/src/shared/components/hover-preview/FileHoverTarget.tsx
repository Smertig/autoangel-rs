import {
  type ComponentType, type LazyExoticComponent, type ReactNode,
  type FocusEvent, type MouseEvent,
  Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import type { AutoangelModule } from '../../../types/autoangel';
import { findFormat, type FormatLoader } from '@shared/formats/registry';
import type { GetData, HoverContext } from '@shared/formats/types';
import { getExtension } from '@shared/util/files';
import { HoverPopover } from './HoverPopover';
import {
  getCachedFetch, registerActive, isActive, subscribeActive,
} from './hoverState';
import type { TriggerRect } from './anchor';

const OPEN_DELAY_MS = 150;

interface FileHoverTargetProps {
  /** Identity for the wrapper. Re-key the component (`<FileHoverTarget key={path}>`)
   *  if `path` can change at runtime — the singleton id is captured per-mount. */
  path: string;
  getData: GetData;
  wasm: AutoangelModule;
  children: ReactNode;
}

const MUTED_STYLE = { color: 'var(--text-muted)' };
function MutedNote({ children }: { children: ReactNode }) {
  return <div style={MUTED_STYLE}>{children}</div>;
}

type State =
  | { phase: 'idle' }
  | { phase: 'loading'; rect: TriggerRect }
  | { phase: 'loaded'; rect: TriggerRect; data: Uint8Array }
  | { phase: 'error'; rect: TriggerRect; message: string };

export function FileHoverTarget({ path, getData, wasm, children }: FileHoverTargetProps) {
  const id = useMemo(() => Symbol(path), [path]);
  const [state, setState] = useState<State>({ phase: 'idle' });
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goIdle = () => setState(s => s.phase === 'idle' ? s : { phase: 'idle' });

  useEffect(() => subscribeActive(() => {
    if (!isActive(id)) {
      goIdle();
      if (openTimer.current) {
        clearTimeout(openTimer.current);
        openTimer.current = null;
      }
    }
  }), [id]);

  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (isActive(id)) registerActive(null);
  }, [id]);

  const close = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (isActive(id)) registerActive(null);
    goIdle();
  };

  const scheduleOpen = (rect: TriggerRect) => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      registerActive(id);
      if (!isActive(id)) return;
      setState({ phase: 'loading', rect });
      getCachedFetch(path, () => getData(path)).then(
        data => { if (isActive(id)) setState({ phase: 'loaded', rect, data }); },
        err => { if (isActive(id)) setState({ phase: 'error', rect, message: String(err) }); },
      );
    }, OPEN_DELAY_MS);
  };

  const onEnter = (_e: MouseEvent | FocusEvent) => {
    const el = wrapperRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    scheduleOpen({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  };

  const ext = getExtension(path);
  // Bytes are in hand only after fetch resolves; no need to plumb sizes
  // through from the package index when `data.length` already has them.
  const size = state.phase === 'loaded' ? state.data.length : null;

  // Cache-routed `getData` for format components: own bytes (path) + every
  // dependency (textures, child files) all share the popover-level cache, so
  // re-hovers don't refetch and `getData(path)` returns the same bytes the
  // wrapper already loaded. Stable per `getData` reference.
  const cachedGetData = useCallback<GetData>(
    (p) => getCachedFetch(p, () => getData(p)),
    [getData],
  );

  let body: ReactNode = null;
  if (state.phase === 'loading') {
    body = <MutedNote>Loading…</MutedNote>;
  } else if (state.phase === 'error') {
    body = <div style={{ color: '#c66' }}>{state.message}</div>;
  } else if (state.phase === 'loaded') {
    const loader = findFormat(ext);
    body = (
      <Suspense fallback={<MutedNote>Loading…</MutedNote>}>
        <HoverPreviewSlot
          loader={loader} path={path} ext={ext}
          data={state.data} getData={cachedGetData} wasm={wasm}
        />
      </Suspense>
    );
  }

  const showPopover = state.phase !== 'idle';

  return (
    <span
      ref={wrapperRef}
      onMouseEnter={onEnter}
      onMouseLeave={close}
      onFocus={onEnter}
      onBlur={close}
      style={{ display: 'inline' }}
    >
      {children}
      {showPopover && (
        <HoverPopover
          path={path}
          size={size}
          triggerRect={(state as Exclude<State, { phase: 'idle' }>).rect}
        >
          {body}
        </HoverPopover>
      )}
    </span>
  );
}

// Module-level cache so all instances share one lazy per loader. Creating
// a fresh `lazy()` per render (the prior `useState(() => lazy(...))` pattern)
// breaks under StrictMode + Suspense — the useState initializer can run
// multiple times before commit, each retry creates a new lazy + factory, and
// Suspense ends up awaiting a different lazy than the one whose factory has
// resolved, so the popover hangs on the fallback.
const hoverPreviewCache = new WeakMap<FormatLoader, LazyExoticComponent<ComponentType<HoverContext>>>();

function getHoverPreviewLazy(loader: FormatLoader): LazyExoticComponent<ComponentType<HoverContext>> {
  const cached = hoverPreviewCache.get(loader);
  if (cached) return cached;
  const Comp = lazy<ComponentType<HoverContext>>(async () => {
    const f = await loader.load();
    if (!f.HoverPreview) {
      const NoPreview: ComponentType<HoverContext> = () => <MutedNote>No preview</MutedNote>;
      return { default: NoPreview };
    }
    return { default: f.HoverPreview };
  });
  hoverPreviewCache.set(loader, Comp);
  return Comp;
}

function HoverPreviewSlot({
  loader, path, ext, data, getData, wasm,
}: {
  loader: FormatLoader;
  path: string;
  ext: string;
  data: Uint8Array;
  getData: GetData;
  wasm: AutoangelModule;
}) {
  const Comp = getHoverPreviewLazy(loader);
  return <Comp path={path} ext={ext} data={data} getData={getData} wasm={wasm} />;
}
