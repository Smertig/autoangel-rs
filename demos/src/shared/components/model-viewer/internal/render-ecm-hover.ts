import type * as ThreeModule from 'three';
import type { HoverCanvasRenderArgs } from '@shared/components/hover-preview/types';
import { ensureThree, getThree } from './three';
import { resolvePath, collectSkinPaths, tryFallbackSkiPath } from '@shared/util/model-dependencies';
import { disposeSkinMeshes, loadAllSkins } from './mesh';
import { setupHoverScene } from './hover-scene';

/**
 * One-shot static render of an ECM into a fixed-size canvas. Loads the
 * referenced SMD + every skin variant and renders them at default pose
 * (no skeleton-bound skinning, no animations) — a recognizable thumbnail
 * without paying the cost of a full skinning + animation pipeline.
 */
export async function renderEcmHoverPreview(
  args: HoverCanvasRenderArgs,
): Promise<() => void> {
  const { canvas, path, data, pkg, wasm, cancelled } = args;

  await ensureThree();
  const { THREE } = getThree();

  // Each `using` block is scoped tightly so the wasm-owned ECM/SMD object
  // is released before the next async hop — keeps wasm memory bounded if
  // the caller queues many hovers in quick succession.
  let smdRelPath: string;
  let additionalSkinPaths: string[];
  {
    using ecm = wasm.EcmModel.parse(data);
    smdRelPath = ecm.skinModelPath;
    additionalSkinPaths = [...(ecm.additionalSkins || [])];
  }
  const smdPath = resolvePath(smdRelPath, path);

  const smdData = await pkg.read(smdPath);
  if (!smdData) throw new Error(`SMD not found: ${smdPath}`);
  if (cancelled()) return () => {};

  let smdSkinPaths: string[];
  {
    using smd = wasm.SmdModel.parse(smdData);
    smdSkinPaths = smd.skinPaths || [];
  }
  if (cancelled()) return () => {};

  const allSkinPaths = collectSkinPaths(smdPath, smdSkinPaths, path, additionalSkinPaths);
  if (allSkinPaths.length === 0) {
    const fallback = await tryFallbackSkiPath(smdPath, pkg);
    if (!fallback) throw new Error('No skin files referenced by SMD');
    allSkinPaths.push(fallback);
  }
  if (cancelled()) return () => {};

  const tracked: ThreeModule.Mesh[] = [];
  let renderer: ThreeModule.WebGLRenderer | null = null;
  const disposeAll = () => {
    renderer?.dispose();
    disposeSkinMeshes(tracked);
  };

  try {
    const perSkin = await loadAllSkins(wasm, pkg, allSkinPaths);

    // Cancellation may have fired while skin variants were decoding —
    // dispose everything we've decoded instead of uploading it to the GPU
    // via a renderer that's about to be torn down.
    if (cancelled()) {
      for (const meshes of perSkin) tracked.push(...meshes);
      disposeAll();
      return () => {};
    }

    const group = new THREE.Group();
    for (const meshes of perSkin) {
      for (const m of meshes) {
        tracked.push(m);
        group.add(m);
      }
    }
    if (group.children.length === 0) throw new Error('No meshes built from skin files');

    const scene = setupHoverScene(THREE, canvas, group);
    renderer = scene.renderer;
    renderer.render(scene.scene, scene.camera);

    return disposeAll;
  } catch (e) {
    disposeAll();
    throw e;
  }
}
