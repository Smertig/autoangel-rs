import { useEffect, useRef, useState } from 'react';
import type { AutoangelModule, TrackSet } from '../../types/autoangel';
import { detectEncoding, decodeText } from '@shared/util/encoding';
import { hexDumpRows } from '@shared/util/hex';
import { getExtension, IMAGE_EXTENSIONS, IMAGE_MIME } from '@shared/util/files';
import { resolvePath, textureCandidates, collectSkinPaths, tryLoadSki, discoverStckPaths } from '@shared/util/model-dependencies';
import styles from './ModelViewer.module.css';

type GetFile = (path: string) => Promise<Uint8Array | null>;

function withWarnOnThrow(getFileRaw: GetFile): GetFile {
  return async (path) => {
    try { return await getFileRaw(path); }
    catch (e: unknown) {
      console.warn('[model] getFile failed:', path, e instanceof Error ? e.message : e);
      return null;
    }
  };
}

// "站立" (standing) — preferred default animation clip
const PREFERRED_ANIM_HINT = '\u7AD9\u7ACB';

const HIDDEN_STYLE: React.CSSProperties = { display: 'none' };

interface ModelViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: (path: string) => Promise<Uint8Array | null>;
  listFiles?: (prefix: string) => string[];
  /**
   * The engine drives a GFX `Model` element with the clip named by its
   * `model_act_name`; without this we'd always start on the idle-hint
   * heuristic and the preview wouldn't match what actually plays in-game.
   * Unknown names fall back to the heuristic with a console warning.
   */
  initialClipName?: string;
}

// ── Three.js module cache ──

let THREE: any = null;
let OrbitControls: any = null;
let threeLoading: Promise<void> | null = null;

async function ensureThree(): Promise<void> {
  if (THREE) return;
  if (threeLoading) return threeLoading;
  threeLoading = (async () => {
    THREE = await import('three');
    const addons = await import('three/addons/controls/OrbitControls.js');
    OrbitControls = addons.OrbitControls;
  })();
  return threeLoading;
}

// ── Texture helpers ──

// Engine stores textures as DDS/TGA (need wasm decoder) or browser-native
// formats like BMP/PNG/JPG (for skins of many scene models). Dispatch by
// extension and build a THREE.CanvasTexture with consistent flipY/colorSpace.
async function loadThreeTexture(
  wasm: AutoangelModule,
  data: Uint8Array,
  texName: string,
): Promise<any | null> {
  const ext = getExtension(texName);
  try {
    if (ext === '.dds') return canvasTextureFromRgba(wasm.decodeDds(data));
    if (ext === '.tga') return canvasTextureFromRgba(wasm.decodeTga(data));
    if (IMAGE_EXTENSIONS.has(ext)) return await textureFromBrowserImage(data, ext);
    console.warn('[model] Unknown texture format:', texName);
    return null;
  } catch (e: unknown) {
    console.warn('[model] Texture decode failed:', texName, e instanceof Error ? e.message : e);
    return null;
  }
}

function canvasTextureFromRgba(decoded: { width: number; height: number; intoRgba(): Uint8Array }): any {
  const { width, height } = decoded;
  const rgba = decoded.intoRgba();

  let hasAlpha = false;
  for (let i = 3; i < rgba.byteLength; i += 4 * 64) {
    if (rgba[i] < 250) { hasAlpha = true; break; }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(
    new ImageData(
      new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength),
      width,
      height,
    ),
    0,
    0,
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex._hasAlpha = hasAlpha;
  return tex;
}

async function textureFromBrowserImage(data: Uint8Array, ext: string): Promise<any> {
  const mime = IMAGE_MIME[ext] ?? 'application/octet-stream';
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  // Browser-decoded formats (BMP/PNG/JPG) don't carry alpha metadata we
  // can cheaply inspect; assume opaque and let materials override if needed.
  tex._hasAlpha = false;
  return tex;
}

// ── Mesh builder ──

function buildMesh(skin: any, index: number, textures: (any | null)[], kind: string, skeleton?: any, boneRemap?: Uint16Array, rigidBoneIdx?: number): any | null {
  const positions = skin[`${kind}MeshPositions`](index);
  const normals = skin[`${kind}MeshNormals`](index);
  const uvs = skin[`${kind}MeshUvs`](index);
  const indices = skin[`${kind}MeshIndices`](index);
  if (!positions || !indices || positions.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals) geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs) geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(new THREE.Uint16BufferAttribute(indices, 1));

  const texIdx = skin[`${kind}MeshTextureIndex`](index);
  const map = (texIdx >= 0 && textures[texIdx]) || null;
  const hasAlpha = map && map._hasAlpha;

  const mat = new THREE.MeshStandardMaterial({
    map,
    side: THREE.DoubleSide,
    color: map ? 0xffffff : 0x888888,
    transparent: hasAlpha || false,
    alphaTest: hasAlpha ? 0.1 : 0,
  });

  if (kind === 'skin' && skeleton) {
    const weights = skin.skinMeshBoneWeights(index);
    const boneIndices = skin.skinMeshBoneIndices(index);
    if (weights && boneIndices) {
      geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
      // Remap bone indices from SKI order to BON/skeleton order
      const indices16 = new Uint16Array(boneIndices.length);
      for (let k = 0; k < boneIndices.length; k++) {
        indices16[k] = boneRemap ? boneRemap[boneIndices[k]] : boneIndices[k];
      }
      geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices16, 4));
      const skinnedMesh = new THREE.SkinnedMesh(geom, mat);
      skinnedMesh.bind(skeleton, new THREE.Matrix4());
      return skinnedMesh;
    }
  }

  // Rigid mesh with skeleton: bind all vertices to a single bone
  if (kind === 'rigid' && skeleton && rigidBoneIdx != null && rigidBoneIdx >= 0) {
    const vertCount = positions.length / 3;
    const weights = new Float32Array(vertCount * 4);
    const boneIndices = new Uint16Array(vertCount * 4);
    for (let v = 0; v < vertCount; v++) {
      weights[v * 4] = 1;  // 100% weight on first bone slot
      boneIndices[v * 4] = rigidBoneIdx;
    }
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(boneIndices, 4));
    const skinnedMesh = new THREE.SkinnedMesh(geom, mat);
    skinnedMesh.bind(skeleton, new THREE.Matrix4());
    return skinnedMesh;
  }

  return new THREE.Mesh(geom, mat);
}

// ── Bone scaling ──

interface BoneScaleData {
  boneIndex: number;
  scale: [number, number, number];
  scaleType: number; // -1 = BoneScaleEx
}

function readEcmBoneScales(ecm: any): { entries: BoneScaleData[]; isNew: boolean; baseBone: string | undefined } {
  const count: number = ecm.boneScaleCount;
  const entries: BoneScaleData[] = [];
  for (let i = 0; i < count; i++) {
    const vals = ecm.boneScaleValues(i);
    if (!vals) continue;
    entries.push({
      boneIndex: ecm.boneScaleBoneIndex(i),
      scale: [vals[0], vals[1], vals[2]],
      scaleType: ecm.boneScaleType(i),
    });
  }
  return { entries, isNew: ecm.newBoneScale, baseBone: ecm.scaleBaseBone };
}

/**
 * Apply BoneScaleEx entries: store per-bone scale factors in userData.
 * These affect the child translation offset during hierarchy update.
 */
function applyBoneScales(bones: any[], entries: BoneScaleData[], isNew: boolean): void {
  for (const e of entries) {
    const bone = bones[e.boneIndex];
    if (!bone) continue;
    if (isNew) {
      // BoneScaleEx: [lenFactor, thickFactor, wholeFactor]
      bone.userData.lenScale = e.scale[0];
      bone.userData.thickScale = e.scale[1];
      bone.userData.wholeScale = e.scale[2];
    } else {
      // Old format: direct scale vector
      bone.userData.boneScale = e.scale;
      bone.userData.boneScaleType = e.scaleType;
    }
  }
}

/**
 * Compute foot offset per the design doc (section 11a).
 * Returns the Y offset to subtract from all bone world positions.
 */
function computeFootOffset(
  bones: any[],
  boneNames: string[],
  baseBone: string | undefined,
  tmpRoot: any,
): number {
  // 1. Current world matrices are the UNSCALED rest pose (already computed)
  //    Find the foot bone.
  let footIdx = -1;
  if (baseBone) {
    footIdx = boneNames.indexOf(baseBone);
  }
  if (footIdx < 0) {
    // Find bone with lowest world Y
    let minY = Infinity;
    const pos = new THREE.Vector3();
    for (let i = 0; i < bones.length; i++) {
      if (bones[i].name === '__root_world__') continue;
      bones[i].getWorldPosition(pos);
      if (pos.y < minY) { minY = pos.y; footIdx = i; }
    }
  }
  if (footIdx < 0) return 0;

  const footBone = bones[footIdx];
  // 2. Ground point in world space (foot projected to Y=0)
  const footWorld = new THREE.Vector3();
  footBone.getWorldPosition(footWorld);
  const groundWorld = new THREE.Vector3(footWorld.x, 0, footWorld.z);

  // 3. Transform ground point to foot bone local space
  const invWorld = new THREE.Matrix4().copy(footBone.matrixWorld).invert();
  const groundLocal = groundWorld.clone().applyMatrix4(invWorld);

  // 4. Apply bone scaling to the hierarchy
  //    Scale child translations by parent's accumulated scale
  applyBoneScalesToHierarchy(bones);
  tmpRoot.updateWorldMatrix(false, true);

  // 5. Transform ground point back to world using SCALED bone matrix
  const groundScaled = groundLocal.clone().applyMatrix4(footBone.matrixWorld);
  return groundScaled.y;
}

/**
 * Propagate bone scale userData into the actual bone translations.
 * For BoneScaleEx: child position *= parent's (wholeScale * lenScale).
 */
function applyBoneScalesToHierarchy(bones: any[]): void {
  // Accumulate whole_scale down the tree (BFS from roots)
  for (const bone of bones) {
    const parentWhole = bone.parent?.userData?.accumulatedWholeScale ?? 1;
    const ownWhole = bone.userData.wholeScale ?? 1;
    bone.userData.accumulatedWholeScale = parentWhole * ownWhole;

    const parentLen = bone.parent?.userData?.lenScale ?? 1;
    const factor = parentWhole * parentLen;
    if (factor !== 1) {
      bone.position.multiplyScalar(factor);
    }
  }
}

// ── Skeleton builder ──

function buildSkeleton(wasm: AutoangelModule, bonData: Uint8Array): {
  skeleton: any;
  bones: any[];
  boneNames: string[];
  tmpRoot: any;
} {
  using skel = wasm.Skeleton.parse(bonData);
  {
    const boneCount = skel.boneCount;
    const bones: any[] = [];
    const boneNames: string[] = [];

    for (let i = 0; i < boneCount; i++) {
      const bone = new THREE.Bone();
      bone.name = skel.boneName(i) || `bone_${i}`;
      bones.push(bone);
      boneNames.push(bone.name);
    }

    for (let i = 0; i < boneCount; i++) {
      const parentIdx = skel.boneParent(i);
      if (parentIdx >= 0 && parentIdx < boneCount) {
        bones[parentIdx].add(bones[i]);
      }
    }

    // Derive bind-pose local transforms from mat_bone_init (inverse bind matrices).
    // The BON file's mat_relative represents the runtime/animation state, not the
    // bind pose where vertices were authored. We compute bind-pose locals as:
    //   bind_world[i] = inverse(mat_bone_init[i])
    //   bind_local[i] = inverse(bind_world[parent]) × bind_world[i]
    const boneInverses: any[] = [];
    for (let i = 0; i < boneCount; i++) {
      const initFlat = skel.boneInitTransform(i);
      const initMat = initFlat ? new THREE.Matrix4().fromArray(initFlat) : new THREE.Matrix4();
      boneInverses.push(initMat);

      const bindWorld = initMat.clone().invert();
      const parentIdx = skel.boneParent(i);
      let bindLocal;
      if (parentIdx >= 0 && parentIdx < boneCount) {
        // bind_local = inverse(bind_world[parent]) × bind_world[i]
        //            = mat_bone_init[parent] × bind_world[i]
        bindLocal = boneInverses[parentIdx].clone().multiply(bindWorld);
      } else {
        bindLocal = bindWorld;
      }
      bindLocal.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);

      if (skel.boneIsFlipped(i)) {
        bones[i].scale.x *= -1;
      }
    }

    // Update world matrices
    const tmpRoot = new THREE.Object3D();
    for (const b of bones) {
      if (!b.parent || b.parent.type !== 'Bone') tmpRoot.add(b);
    }
    tmpRoot.updateWorldMatrix(false, true);

    // Extra bone slot at index == boneCount
    const extraBone = new THREE.Bone();
    extraBone.name = '__root_world__';
    tmpRoot.add(extraBone);
    bones.push(extraBone);
    boneNames.push(extraBone.name);
    boneInverses.push(new THREE.Matrix4());
    tmpRoot.updateWorldMatrix(false, true);

    const skeleton = new THREE.Skeleton(bones, boneInverses);
    return { skeleton, bones, boneNames, tmpRoot };
  }
}

// ── LRU clip cache ──

class ClipCache {
  private map = new Map<string, any>();
  constructor(private maxSize: number) {}

  get(name: string): any | undefined {
    const clip = this.map.get(name);
    if (clip !== undefined) {
      this.map.delete(name);
      this.map.set(name, clip);
    }
    return clip;
  }

  set(name: string, clip: any): void {
    if (this.map.has(name)) {
      this.map.delete(name);
    } else if (this.map.size >= this.maxSize) {
      const first = this.map.keys().next().value!;
      this.map.delete(first);
    }
    this.map.set(name, clip);
  }
}

// ── Animation clip builder ──

function buildKeyTimes(keyCount: number, frameIds: Uint16Array | undefined, frameRate: number): Float32Array {
  const times = new Float32Array(keyCount);
  if (frameIds) {
    for (let k = 0; k < keyCount; k++) times[k] = frameIds[k] / frameRate;
  } else {
    for (let k = 0; k < keyCount; k++) times[k] = k / frameRate;
  }
  return times;
}

function buildAnimationClip(
  wasm: AutoangelModule,
  stckData: Uint8Array,
  clipName: string,
  boneNames: string[],
): any | null {
  using ts = wasm.TrackSet.parse(stckData);
  const trackCount: number = ts.trackCount;
  const fps = ts.animFps || 30;
  const duration = (ts.animEnd - ts.animStart) / fps;
  const tracks: any[] = [];

  for (let t = 0; t < trackCount; t++) {
    const boneId: number = ts.boneId(t);
    if (boneId < 0 || boneId >= boneNames.length) continue;
    const boneName = boneNames[boneId];

    const posKeys: Float32Array | undefined = ts.positionKeys(t);
    if (posKeys && posKeys.length > 0) {
      const times = buildKeyTimes(posKeys.length / 3, ts.positionFrameIds(t), ts.positionFrameRate(t));
      tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, times, posKeys));
    }

    const rotKeys: Float32Array | undefined = ts.rotationKeys(t);
    if (rotKeys && rotKeys.length > 0) {
      const times = buildKeyTimes(rotKeys.length / 4, ts.rotationFrameIds(t), ts.rotationFrameRate(t));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, rotKeys));
    }
  }

  if (tracks.length === 0 || duration <= 0) return null;
  return new THREE.AnimationClip(clipName, duration, tracks);
}

// ── SKI loader ──

interface SkinStats {
  verts: number;
  tris: number;
  meshes: number;
  textures: number;
}

async function loadSkinFile(
  wasm: AutoangelModule,
  getFile: (path: string) => Promise<Uint8Array | null>,
  skiArchivePath: string,
  skiData: Uint8Array,
  skeleton?: any,
  skelBoneNames?: string[],
): Promise<{ meshes: any[]; stats: SkinStats }> {
  using skin = wasm.Skin.parse(skiData);
  const stats: SkinStats = { verts: 0, tris: 0, meshes: 0, textures: 0 };
  const meshes: any[] = [];

  {
    // Build remap table: SKI bone index → skeleton (BON) bone index
    let boneRemap: Uint16Array | undefined;
    if (skeleton && skelBoneNames) {
      const skiBoneNames: string[] = skin.boneNames || [];
      if (skiBoneNames.length > 0) {
        const nameToIdx = new Map<string, number>();
        for (let i = 0; i < skelBoneNames.length; i++) nameToIdx.set(skelBoneNames[i], i);
        boneRemap = new Uint16Array(skiBoneNames.length);
        for (let i = 0; i < skiBoneNames.length; i++) {
          boneRemap[i] = nameToIdx.get(skiBoneNames[i]) ?? 0;
        }
        console.log(`[model] Bone remap: ${skiBoneNames.length} SKI bones → ${skelBoneNames.length} BON bones`);
      } else {
        console.warn('[model] No SKI bone names — cannot remap');
      }
    }

    const textureNames: string[] = skin.textures || [];
    const textures = await Promise.all(
      textureNames.map(async (texName: string) => {
        for (const tp of textureCandidates(skiArchivePath, texName)) {
          const texData = await getFile(tp);
          if (texData) return await loadThreeTexture(wasm, texData, texName);
        }
        console.warn('[model] Texture not found:', texName);
        return null;
      }),
    );
    stats.textures = textures.filter(Boolean).length;

    for (let i = 0; i < skin.skinMeshCount; i++) {
      const mesh = buildMesh(skin, i, textures, 'skin', skeleton, boneRemap);
      if (mesh) meshes.push(mesh);
    }
    for (let i = 0; i < skin.rigidMeshCount; i++) {
      let boneIdx = skin.rigidMeshBoneIndex(i);
      if (boneIdx >= 0 && boneRemap) boneIdx = boneRemap[boneIdx] ?? boneIdx;
      const mesh = buildMesh(skin, i, textures, 'rigid',
        skeleton && boneIdx >= 0 ? skeleton : undefined,
        undefined, boneIdx >= 0 ? boneIdx : undefined);
      if (mesh) meshes.push(mesh);
    }

    for (const m of meshes) {
      stats.meshes++;
      stats.verts += m.geometry.attributes.position.count;
      stats.tris += m.geometry.index ? m.geometry.index.count / 3 : 0;
    }
  }

  return { meshes, stats };
}

// ── Persistent viewer ──

interface Viewer {
  container: HTMLElement;
  renderer: any;
  resizeObs: ResizeObserver;
  scene: any;
  camera: any;
  controls: any;
  mixer: any;
  /** Called each frame after mixer.update() to apply foot offset / bone scaling. */
  onBeforeRender: (() => void) | null;
  /** Called each frame to update transport bar UI (scrubber, time display). */
  onFrameUpdate: (() => void) | null;
  dispose(): void;
  _disposeScene(): void;
}

let viewer: Viewer | null = null;

function getViewer(container: HTMLElement): Viewer {
  if (viewer && viewer.container === container) return viewer;
  if (viewer) viewer.dispose();

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth || 400, container.clientHeight || 400);

  container.classList.add('model-active');
  container.replaceChildren(renderer.domElement);

  const resizeObs = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0 && viewer && viewer.camera) {
      viewer.camera.aspect = width / height;
      viewer.camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
  });
  resizeObs.observe(container);

  let animId: number;
  const clock = new THREE.Clock();
  function animate() {
    animId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (viewer && viewer.mixer) viewer.mixer.update(delta);
    if (viewer && viewer.onBeforeRender) viewer.onBeforeRender();
    if (viewer && viewer.onFrameUpdate) viewer.onFrameUpdate();
    if (viewer && viewer.controls) viewer.controls.update();
    if (viewer && viewer.scene) renderer.render(viewer.scene, viewer.camera);
  }
  animate();

  viewer = {
    container,
    renderer,
    resizeObs,
    scene: null,
    camera: null,
    controls: null,
    mixer: null,
    onBeforeRender: null,
    onFrameUpdate: null,
    dispose() {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      if (this.controls) this.controls.dispose();
      renderer.dispose();
      this.container.classList.remove('model-active');
      this._disposeScene();
      viewer = null;
    },
    _disposeScene() {
      if (!this.scene) return;
      this.scene.traverse((c: any) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
      });
      this.scene = null;
    },
  };
  return viewer;
}

// ── Clip-error toast ──

function showClipToast(container: HTMLElement, message: string): void {
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

// ── Animation event metadata ──

const EVENT_GFX = 100 as const;
const EVENT_SOUND = 101 as const;

interface AnimEvent {
  type: typeof EVENT_GFX | typeof EVENT_SOUND;
  filePath: string; // basename only
  startTime: number; // ms, 0 if not set
  hookName: string; // empty if not set
}

/** Build a map from STCK animation name stem → events from ECM combined actions. */
function buildAnimEventMap(ecm: any, animNames: string[]): Map<string, AnimEvent[]> {
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

// ── Scene mount ──

function mountScene(
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
): void {
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
  v.controls = new OrbitControls(v.camera, v.renderer.domElement);
  v.controls.target.copy(center);
  v.controls.enableDamping = true;
  v.controls.dampingFactor = 0.08;
  v.controls.update();

  v.renderer.render(v.scene, v.camera);

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = styles.modelToolbar;

  const wireBtn = makeToolbarBtn('Wireframe', () => {
    (wireBtn as any)._on = !(wireBtn as any)._on;
    group.traverse((c: any) => { if (c.material) c.material.wireframe = (wireBtn as any)._on; });
    wireBtn.classList.toggle(styles.btnActive, (wireBtn as any)._on);
  });
  toolbar.appendChild(wireBtn);

  const bgBtn = makeToolbarBtn('Light BG', () => {
    (bgBtn as any)._on = !(bgBtn as any)._on;
    scene.background = new THREE.Color((bgBtn as any)._on ? 0xe0e0e0 : 0x2a2a2a);
    bgBtn.classList.toggle(styles.btnActive, (bgBtn as any)._on);
  });
  toolbar.appendChild(bgBtn);

  const resetBtn = makeToolbarBtn('Reset Camera', () => {
    v.camera.position.copy(center).add(defaultCamOffset);
    v.controls.target.copy(center);
    v.controls.update();
  });
  toolbar.appendChild(resetBtn);

  // Skeleton overlay toggle (only if skeleton is available)
  let bonesBtn: HTMLButtonElement | undefined;
  if (skeleton) {
    bonesBtn = makeToolbarBtn('Bones', () => {
      (bonesBtn as any)._on = !(bonesBtn as any)._on;
      if ((bonesBtn as any)._on) {
        const helper = new THREE.SkeletonHelper(group);
        helper.name = '__skeleton_helper__';
        scene.add(helper);
      } else {
        const helper = scene.getObjectByName('__skeleton_helper__');
        if (helper) {
          scene.remove(helper);
          helper.dispose();
        }
      }
      bonesBtn!.classList.toggle(styles.btnActive, (bonesBtn as any)._on);
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
    }
    function seekTo(t: number) {
      const action = getAction();
      if (action) action.time = t;
      if (v.mixer) v.mixer.update(0);
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
          if (activeItemEl) activeItemEl.classList.remove(styles.animListItemActive);
          item.classList.add(styles.animListItemActive);
          activeItemEl = item;
          rebuildEventLane(clipName);
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

    function showTooltip(tick: HTMLElement, ev: AnimEvent) {
      const isGfx = ev.type === EVENT_GFX;
      const prefix = isGfx ? '\u2726 GFX' : '\u266A Sound';
      const typeClass = isGfx ? styles.eventTooltipGfx : styles.eventTooltipSound;
      tooltip.className = `${styles.eventTooltip} ${typeClass} ${styles.eventTooltipVisible}`;
      tooltip.innerHTML = '';

      const header = document.createElement('div');
      header.className = styles.eventTooltipHeader;
      header.textContent = prefix;
      tooltip.appendChild(header);

      const file = document.createElement('div');
      file.className = styles.eventTooltipFile;
      file.textContent = ev.filePath;
      tooltip.appendChild(file);

      if (ev.startTime > 0) {
        const time = document.createElement('div');
        time.className = styles.eventTooltipDetail;
        time.textContent = `@ ${ev.startTime}ms`;
        tooltip.appendChild(time);
      }
      if (ev.hookName) {
        const hook = document.createElement('div');
        hook.className = styles.eventTooltipDetail;
        hook.textContent = `hook: ${ev.hookName}`;
        tooltip.appendChild(hook);
      }

      // Position above the tick, in container coordinates
      const containerRect = container.getBoundingClientRect();
      const tickRect = tick.getBoundingClientRect();
      const tickCenterX = tickRect.left + tickRect.width / 2 - containerRect.left;
      const tipWidth = 200;
      let left = tickCenterX - tipWidth / 2;
      left = Math.max(4, Math.min(left, containerRect.width - tipWidth - 4));
      tooltip.style.left = `${left}px`;
      tooltip.style.bottom = `${containerRect.bottom - tickRect.top + 4}px`;
    }

    function hideTooltip() {
      tooltip.classList.remove(styles.eventTooltipVisible);
    }

    /** Rebuild event tick marks on the timeline lane for the given clip. */
    function rebuildEventLane(clipName: string) {
      eventLane.replaceChildren();
      hideTooltip();
      const events = animEventMap?.get(clipName);
      const dur = getDuration();
      if (!events || events.length === 0 || dur <= 0) return;
      for (const ev of events) {
        const pct = Math.min(100, Math.max(0, (ev.startTime / 1000) / dur * 100));
        const tick = document.createElement('div');
        tick.className = ev.type === EVENT_GFX ? styles.eventTickGfx : styles.eventTickSound;
        tick.style.left = `${pct}%`;
        tick.onmouseenter = () => showTooltip(tick, ev);
        tick.onmouseleave = hideTooltip;
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
        if (v.mixer && playing) v.mixer.timeScale = spd;
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

function makeToolbarBtn(label: string, onclick: (() => void) | null): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = styles.btn;
  btn.textContent = label;
  (btn as any)._on = false;
  if (onclick) btn.onclick = onclick;
  return btn;
}

function buildHexDump(data: Uint8Array): HTMLPreElement {
  const rows = hexDumpRows(data);
  const lines = rows.map((r) => `${r.offset}  ${r.hex}  ${r.ascii}`);
  if (data.length > 4096) lines.push(`\n... (${data.length.toLocaleString()} bytes total)`);
  const pre = document.createElement('pre');
  pre.className = styles.hexDump;
  pre.textContent = lines.join('\n');
  return pre;
}

// ── Public render functions ──

/**
 * Shared renderer driven by an already-fetched SMD. Both the ECM path
 * (wraps this after parsing ECM) and the raw-SMD path (calls this directly)
 * end up here. `opts` carries ECM-specific enhancements — when absent, we
 * render a plain SMD: skeleton + meshes + any STCK animations found, with
 * no bone scaling, no additional skin variants, and no animation events.
 */
async function renderFromSmd(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFile: GetFile,
  smdPath: string,
  smdData: Uint8Array,
  listFiles: ((prefix: string) => string[]) | undefined,
  opts?: {
    additionalSkins?: { paths: string[]; basePath: string };
    boneScaleInfo?: { entries: BoneScaleData[]; isNew: boolean; baseBone: string | undefined };
    eventMapFromAnimNames?: (animNames: string[]) => Map<string, AnimEvent[]> | undefined;
    source?: { data: Uint8Array; ext: string };
    initialClipName?: string;
  },
): Promise<void> {
  let smdSkinPaths: string[] = [];
  let smdTcksDir: string | undefined;
  let skelData: { skeleton: any; bones: any[]; boneNames: string[]; tmpRoot: any; footOffset: number } | null = null;
  {
    using smd = wasm.SmdModel.parse(smdData);
    smdSkinPaths = smd.skinPaths || [];
    smdTcksDir = smd.tcksDir;
    const bonRelPath: string = smd.skeletonPath;
    if (bonRelPath) {
      const bonPath = resolvePath(bonRelPath, smdPath);
      const bonData = await getFile(bonPath);
      if (bonData) {
        try {
          const built = buildSkeleton(wasm, bonData);
          skelData = { ...built, footOffset: 0 };
          console.log(
            `[model] Skeleton built: ${skelData.boneNames.length} bones`,
          );
        } catch (e) {
          console.warn('[model] Failed to build skeleton:', e);
        }
      }
    }
  }

  if (skelData && opts?.boneScaleInfo) {
    const { entries, isNew, baseBone } = opts.boneScaleInfo;
    applyBoneScales(skelData.bones, entries, isNew);
    skelData.footOffset = computeFootOffset(
      skelData.bones, skelData.boneNames, baseBone, skelData.tmpRoot,
    );
    console.log(`[model] Bone scaling: ${entries.length} entries, footOffset=${skelData.footOffset.toFixed(3)}`);
  }

  const allSkinPaths = collectSkinPaths(
    smdPath,
    smdSkinPaths,
    opts?.additionalSkins?.basePath ?? smdPath,
    opts?.additionalSkins?.paths ?? [],
  );
  if (allSkinPaths.length === 0) {
    throw new Error('No skin files referenced by SMD');
  }

  // Discover animation file paths (no parsing yet — clips are loaded lazily on click)
  const animNames: string[] = [];
  let loadClip: ((name: string) => Promise<any>) | undefined;
  if (listFiles && skelData) {
    const stckPaths = discoverStckPaths(smdPath, smdTcksDir, listFiles);
    const stckPathByName = new Map<string, string>();
    for (const stckPath of stckPaths) {
      const clipName = stckPath.split('\\').pop()!.replace(/\.stck$/i, '');
      animNames.push(clipName);
      stckPathByName.set(clipName, stckPath);
    }
    console.log(`[model] Animation clips discovered: ${animNames.length}`);

    const clipCache = new ClipCache(50);
    const boneNames = skelData.boneNames;
    loadClip = async (name: string): Promise<any> => {
      const cached = clipCache.get(name);
      if (cached) return cached;
      const path = stckPathByName.get(name);
      if (!path) throw new Error('Animation path not in track directory');
      const stckData = await getFile(path);
      if (!stckData) throw new Error('Failed to read STCK file from archive');
      const clip = buildAnimationClip(wasm, stckData, name, boneNames);
      if (!clip) throw new Error('No bone tracks matched or zero duration');
      clipCache.set(name, clip);
      return clip;
    };
  }

  // Callers that own an ECM handle can build an event map here while the
  // `using ecm` scope is still alive.
  const animEventMap = animNames.length > 0
    ? opts?.eventMapFromAnimNames?.(animNames)
    : undefined;

  // Only use skinning if we have animations to play
  const useSkinning = animNames.length > 0 && skelData != null;

  const group = new THREE.Group();
  // Apply foot offset as group-level Y shift (design doc section 13 step 4)
  if (skelData && skelData.footOffset !== 0) {
    group.position.y -= skelData.footOffset;
  }
  const totalStats: SkinStats = { verts: 0, tris: 0, meshes: 0, textures: 0 };

  if (useSkinning && skelData) {
    const rootBones = skelData.bones.filter(
      (b: any) => !b.parent || b.parent.type !== 'Bone'
    );
    for (const rb of rootBones) group.add(rb);
  }

  for (const skiPath of allSkinPaths) {
    const ski = await tryLoadSki(skiPath, getFile);
    if (!ski) { console.warn('[model] SKI not found:', skiPath); continue; }

    const { meshes, stats } = await loadSkinFile(wasm, getFile, ski.archivePath, ski.data, useSkinning ? skelData!.skeleton : undefined, useSkinning ? skelData!.boneNames : undefined);
    for (const m of meshes) group.add(m);
    totalStats.verts += stats.verts;
    totalStats.tris += stats.tris;
    totalStats.meshes += stats.meshes;
    totalStats.textures += stats.textures;
  }

  if (group.children.length === 0) {
    throw new Error('No meshes could be built from skin files');
  }

  // Set up AnimationMixer and eagerly load the preferred clip
  let initialClip: { name: string; clip: any } | null = null;
  {
    const v = getViewer(container);
    if (v.mixer) { v.mixer.stopAllAction(); v.mixer = null; }
    v.onBeforeRender = null;
    if (animNames.length > 0 && loadClip) {
      v.mixer = new THREE.AnimationMixer(group);
      if (opts?.initialClipName && !animNames.includes(opts.initialClipName)) {
        console.warn(`[model] initialClipName '${opts.initialClipName}' not in track set; falling back to idle heuristic`);
      }
      const preferredName = (opts?.initialClipName && animNames.includes(opts.initialClipName))
        ? opts.initialClipName
        : animNames.find((n) => n.includes(PREFERRED_ANIM_HINT)) ?? animNames[0];
      try {
        const clip = await loadClip(preferredName);
        initialClip = { name: preferredName, clip };
        v.mixer.clipAction(clip).play();
      } catch (e) {
        console.warn('[model] Failed to load initial clip:', preferredName, e);
      }

      if (skelData?.bones.some((b: any) => b.userData.wholeScale || b.userData.lenScale)) {
        const animBones = skelData!.bones;
        v.onBeforeRender = () => {
          applyBoneScalesToHierarchy(animBones);
        };
      }
    }
  }

  mountScene(
    container, group, totalStats,
    opts?.source?.data ?? smdData,
    opts?.source?.ext ?? '.smd',
    animNames, loadClip, initialClip, skelData?.skeleton, animEventMap,
  );
}

interface RenderOptions {
  listFiles?: (prefix: string) => string[];
  initialClipName?: string;
}

async function renderModel(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: GetFile,
  ecmPath: string,
  opts: RenderOptions = {},
): Promise<void> {
  await ensureThree();
  const getFile = withWarnOnThrow(getFileRaw);

  const ecmData = await getFile(ecmPath);
  if (!ecmData) throw new Error(`File not found: ${ecmPath}`);
  using ecm = wasm.EcmModel.parse(ecmData);

  const smdPath = resolvePath(ecm.skinModelPath, ecmPath);
  const smdData = await getFile(smdPath);
  if (!smdData) throw new Error(`File not found: ${smdPath}`);

  // Snapshot additionalSkins before ecm's `using` scope frees it.
  const additionalSkinPaths = [...(ecm.additionalSkins || [])];

  await renderFromSmd(container, wasm, getFile, smdPath, smdData, opts.listFiles, {
    additionalSkins: { paths: additionalSkinPaths, basePath: ecmPath },
    boneScaleInfo: ecm.boneScaleCount > 0 ? readEcmBoneScales(ecm) : undefined,
    eventMapFromAnimNames: (animNames) => buildAnimEventMap(ecm, animNames),
    source: { data: ecmData, ext: '.ecm' },
    initialClipName: opts.initialClipName,
  });
}

async function renderSmd(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: GetFile,
  smdPath: string,
  opts: RenderOptions = {},
): Promise<void> {
  await ensureThree();
  const getFile = withWarnOnThrow(getFileRaw);

  const smdData = await getFile(smdPath);
  if (!smdData) throw new Error(`File not found: ${smdPath}`);

  await renderFromSmd(container, wasm, getFile, smdPath, smdData, opts.listFiles, {
    initialClipName: opts.initialClipName,
  });
}

async function renderSkin(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: GetFile,
  skiPath: string,
): Promise<void> {
  await ensureThree();
  const getFile = withWarnOnThrow(getFileRaw);

  const skiData = await getFile(skiPath);
  if (!skiData) throw new Error(`File not found: ${skiPath}`);

  const group = new THREE.Group();
  const { meshes, stats } = await loadSkinFile(wasm, getFile, skiPath, skiData);
  for (const m of meshes) group.add(m);

  if (group.children.length === 0) {
    throw new Error('No meshes could be built from skin file');
  }

  mountScene(container, group, stats, skiData, '.ski');
}

async function renderTrackSet(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: (path: string) => Promise<Uint8Array | null>,
  stckPath: string,
): Promise<void> {
  const data = await getFileRaw(stckPath);
  if (!data) throw new Error(`File not found: ${stckPath}`);
  using ts = wasm.TrackSet.parse(data);
  const fps = ts.animFps || 30;
  const duration = (ts.animEnd - ts.animStart) / fps;
  const div = document.createElement('div');
  div.style.cssText = 'padding: 16px; font-family: monospace; color: #ccc;';
  div.innerHTML = [
    '<h3 style="margin: 0 0 12px; color: #fff;">STCK Track Set</h3>',
    '<table style="border-collapse: collapse;">',
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">Version</td><td>${ts.version}</td></tr>`,
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">Frames</td><td>${ts.animStart} \u2013 ${ts.animEnd}</td></tr>`,
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">FPS</td><td>${fps}</td></tr>`,
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">Bone tracks</td><td>${ts.trackCount}</td></tr>`,
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">Duration</td><td>${duration.toFixed(2)}s</td></tr>`,
    '</table>',
  ].join('');
  container.replaceChildren(div);
}

// ── React Component ──

export function ModelViewer({ path, wasm, getData, listFiles, initialClipName }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the current path to cancel stale loads
  const currentPathRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setError(null);
    currentPathRef.current = path;

    const ext = getExtension(path);
    const renderFn = ext === '.ecm'
      ? () => renderModel(container, wasm, getData, path, { listFiles, initialClipName })
      : ext === '.smd'
      ? () => renderSmd(container, wasm, getData, path, { listFiles, initialClipName })
      : ext === '.stck'
      ? () => renderTrackSet(container, wasm, getData, path)
      : () => renderSkin(container, wasm, getData, path);

    renderFn().catch((e: unknown) => {
      // Only show error if this effect is still current
      if (currentPathRef.current !== path) return;
      console.error('[model] Preview failed:', e);
      // Clean up viewer on error
      if (viewer) { viewer.dispose(); viewer = null; }
      if (container) container.innerHTML = '';
      setError(`Model preview failed: ${e instanceof Error ? e.message : String(e)}`);
    });

    // No cleanup on path change — the persistent viewer pattern lets the
    // new render() paint over the old scene without a white flash.
    // Cleanup on component unmount is handled by a separate effect below.
    // `initialClipName` intentionally omitted: changing it alone shouldn't
    // trigger a full model re-download. The right fix (swap the live
    // mixer's clip in place) is a follow-up; until then, the clip applies
    // on the next path change, which covers every current caller.
  }, [path, wasm, getData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dispose viewer only on component unmount (not path change)
  useEffect(() => {
    return () => {
      if (viewer) { viewer.dispose(); viewer = null; }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  return (
    <>
      {error && <div className={styles.modelError}>{error}</div>}
      <div ref={containerRef} className={styles.modelContainer} style={error ? HIDDEN_STYLE : undefined} />
    </>
  );
}
