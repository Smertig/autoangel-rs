import { useEffect, useMemo, useRef, useState } from 'react';
import type { AutoangelModule } from '../../../types/autoangel';
import type { PackageView } from '@shared/package';
import { ensureThree } from './internal/three';
import { disposeViewer } from './internal/viewer';
import { mountBonScene, type BonSceneApi } from './internal/mount-bon-scene';
import { BonSidebar, buildBoneTree, type SelectedMeta } from './internal/BonSidebar';
import { ModelSurface } from './internal/ModelSurface';
import styles from './BonViewer.module.css';

interface BonViewerProps {
  path: string;
  wasm: AutoangelModule;
  pkg: PackageView;
}

interface ApiData {
  bones: BonSceneApi['bones'];
  hooks: BonSceneApi['hooks'];
}

export function BonViewer({ path, wasm, pkg }: BonViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<BonSceneApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    setError(null);
    setSelected(null);
    setData(null);

    (async () => {
      try {
        await ensureThree();
        const bytes = await pkg.read(path);
        if (cancelled) return;
        if (!bytes) throw new Error(`File not found: ${path}`);
        const api = mountBonScene(container, wasm, bytes);
        if (cancelled) { api.dispose(); return; }
        apiRef.current = api;
        setData({ bones: api.bones, hooks: api.hooks });
      } catch (e) {
        if (cancelled) return;
        console.error('[bon] preview failed:', e);
        disposeViewer(container);
        container.innerHTML = '';
        setError(`BON preview failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [path, wasm, pkg]);

  // Final unmount: tear down the per-container Viewer (canvas + WebGL ctx)
  // that `mountBonScene` registered via `getViewer`.
  useEffect(() => () => {
    const container = containerRef.current;
    if (container) {
      disposeViewer(container);
      container.innerHTML = '';
    }
  }, []);

  useEffect(() => {
    apiRef.current?.setSelected(selected);
  }, [selected]);

  const roots = useMemo(
    () => (data ? buildBoneTree(data.bones, data.hooks) : []),
    [data],
  );

  // Built once per file open; lets `computeMeta` resolve any name in O(1)
  // and read child counts without walking `data.bones` per click.
  const indexes = useMemo(() => {
    if (!data) return null;
    const boneIdxByName = new Map<string, number>();
    for (let i = 0; i < data.bones.length; i++) boneIdxByName.set(data.bones[i].name, i);
    const childCountByIdx = new Array<number>(data.bones.length).fill(0);
    for (const b of data.bones) if (b.parent >= 0) childCountByIdx[b.parent]++;
    const hookByName = new Map<string, { bone_index: number }>();
    for (const h of data.hooks) hookByName.set(h.name, h);
    return { boneIdxByName, childCountByIdx, hookByName };
  }, [data]);

  const selectedMeta = useMemo<SelectedMeta | null>(() => {
    if (!data || !indexes || !selected) return null;
    return computeMeta(selected, data, indexes, apiRef.current);
  }, [data, indexes, selected]);

  return (
    <div className={styles.layout}>
      <div className={styles.sceneCol}>
        <ModelSurface containerRef={containerRef} error={error} />
        {!error && data && (
          <div className={styles.statBadge}>
            {data.bones.length} bones · {data.hooks.length} hooks
          </div>
        )}
      </div>
      {!error && data && (
        <BonSidebar
          roots={roots}
          selected={selected}
          onSelect={setSelected}
          selectedMeta={selectedMeta}
        />
      )}
    </div>
  );
}

interface BoneIndexes {
  boneIdxByName: Map<string, number>;
  childCountByIdx: number[];
  hookByName: Map<string, { bone_index: number }>;
}

function computeMeta(
  name: string,
  data: ApiData,
  idx: BoneIndexes,
  api: BonSceneApi | null,
): SelectedMeta | null {
  const world = api?.worldPositionOf(name) ?? null;
  const boneIdx = idx.boneIdxByName.get(name);
  if (boneIdx != null) {
    const parentIdx = data.bones[boneIdx].parent;
    const parent = parentIdx >= 0 ? data.bones[parentIdx]?.name ?? null : null;
    return { name, kind: 'bone', parent, childCount: idx.childCountByIdx[boneIdx], world };
  }
  const hook = idx.hookByName.get(name);
  if (hook) {
    const owner = data.bones[hook.bone_index]?.name ?? null;
    return { name, kind: 'hook', parent: owner, childCount: 0, world };
  }
  return null;
}
