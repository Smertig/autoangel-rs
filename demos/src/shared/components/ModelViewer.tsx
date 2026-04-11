import { useEffect, useRef, useState } from 'react';
import type { AutoangelModule } from '../../types/autoangel';
import { detectEncoding, decodeText } from '@shared/util/encoding';
import { hexDumpRows } from '@shared/util/hex';
import styles from './ModelViewer.module.css';

interface ModelViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: (path: string) => Promise<Uint8Array | null>;
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

// ── Path helpers ──

function resolveRelative(parentPath: string, basename: string): string {
  const dir = parentPath.substring(0, parentPath.lastIndexOf('\\') + 1);
  return (dir + basename).toLowerCase();
}

// ── Texture helpers ──

function ddsToThreeTexture(wasm: AutoangelModule, data: Uint8Array): any | null {
  try {
    const decoded = wasm.decodeDds(data);
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
  } catch (e: unknown) {
    console.warn('[model] DDS decode failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Mesh builder ──

function buildMesh(skin: any, index: number, textures: (any | null)[], kind: string): any | null {
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

  return new THREE.Mesh(geom, mat);
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
): Promise<{ meshes: any[]; stats: SkinStats }> {
  const skin = wasm.WasmSkin.parse(skiData);
  const stats: SkinStats = { verts: 0, tris: 0, meshes: 0, textures: 0 };
  const meshes: any[] = [];

  try {
    const textureNames: string[] = skin.textures || [];
    const skiBasename = skiArchivePath.split('\\').pop()!.replace(/\.ski$/i, '');
    const textures = await Promise.all(
      textureNames.map(async (texName: string) => {
        const candidates = [
          resolveRelative(skiArchivePath, 'textures\\' + texName),
          resolveRelative(skiArchivePath, 'tex_' + skiBasename + '\\' + texName),
          resolveRelative(skiArchivePath, texName),
        ];
        for (const tp of candidates) {
          const texData = await getFile(tp);
          if (texData) return ddsToThreeTexture(wasm, texData);
        }
        console.warn('[model] Texture not found:', texName);
        return null;
      }),
    );
    stats.textures = textures.filter(Boolean).length;

    for (let i = 0; i < skin.skinMeshCount; i++) {
      const mesh = buildMesh(skin, i, textures, 'skin');
      if (mesh) meshes.push(mesh);
    }
    for (let i = 0; i < skin.rigidMeshCount; i++) {
      const mesh = buildMesh(skin, i, textures, 'rigid');
      if (mesh) meshes.push(mesh);
    }

    for (const m of meshes) {
      stats.meshes++;
      stats.verts += m.geometry.attributes.position.count;
      stats.tris += m.geometry.index ? m.geometry.index.count / 3 : 0;
    }
  } finally {
    skin.free();
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
  function animate() {
    animId = requestAnimationFrame(animate);
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

// ── Scene mount ──

function mountScene(
  container: HTMLElement,
  group: any,
  totalStats: SkinStats,
  sourceData: Uint8Array,
  sourceExt: string,
): void {
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

  const v = getViewer(container);
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

  const info = document.createElement('div');
  info.className = styles.modelInfo;
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
    container.replaceChildren(canvas, toolbar, info);
    wireBtn.style.display = bgBtn.style.display = resetBtn.style.display = '';
  };
  modeSrc.onclick = () => {
    modeSrc.classList.add(styles.btnActive);
    mode3d.classList.remove(styles.btnActive);
    container.replaceChildren(getSourceEl(), toolbar);
    wireBtn.style.display = bgBtn.style.display = resetBtn.style.display = 'none';
  };

  container.replaceChildren(canvas, toolbar, info);
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

async function renderModel(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: (path: string) => Promise<Uint8Array | null>,
  ecmPath: string,
): Promise<void> {
  await ensureThree();
  const getFile = async (path: string) => {
    try { return await getFileRaw(path); }
    catch (e: unknown) { console.warn('[model] getFile failed:', path, e instanceof Error ? e.message : e); return null; }
  };

  const ecmData = await getFile(ecmPath);
  if (!ecmData) throw new Error(`File not found: ${ecmPath}`);
  const ecm = wasm.EcmModel.parse(ecmData);

  const smdRelPath = ecm.skinModelPath;
  const smdPath = smdRelPath.includes('\\')
    ? smdRelPath.toLowerCase()
    : resolveRelative(ecmPath, smdRelPath);
  const smdData = await getFile(smdPath);
  let smdSkinPaths: string[] = [];
  if (smdData) {
    const smd = wasm.SmdModel.parse(smdData);
    try { smdSkinPaths = smd.skinPaths || []; } finally { smd.free(); }
  }

  const allSkinPaths: string[] = [];
  for (const sp of smdSkinPaths) {
    if (sp) allSkinPaths.push(resolveRelative(smdPath, sp));
  }
  for (const sp of (ecm.additionalSkins || [])) {
    const resolved = sp.includes('\\') ? sp.toLowerCase() : resolveRelative(ecmPath, sp);
    if (!allSkinPaths.includes(resolved)) allSkinPaths.push(resolved);
  }
  ecm.free();

  if (allSkinPaths.length === 0) {
    throw new Error('No skin files referenced by ECM or SMD');
  }

  const group = new THREE.Group();
  const totalStats: SkinStats = { verts: 0, tris: 0, meshes: 0, textures: 0 };

  for (const skiPath of allSkinPaths) {
    let skiData = await getFile(skiPath);
    let skiArchivePath = skiPath;
    if (!skiData && !skiPath.startsWith('models\\')) {
      const withPrefix = 'models\\' + skiPath;
      skiData = await getFile(withPrefix);
      if (skiData) skiArchivePath = withPrefix;
    }
    if (!skiData) { console.warn('[model] SKI not found:', skiPath); continue; }

    const { meshes, stats } = await loadSkinFile(wasm, getFile, skiArchivePath, skiData);
    for (const m of meshes) group.add(m);
    totalStats.verts += stats.verts;
    totalStats.tris += stats.tris;
    totalStats.meshes += stats.meshes;
    totalStats.textures += stats.textures;
  }

  if (group.children.length === 0) {
    throw new Error('No meshes could be built from skin files');
  }

  mountScene(container, group, totalStats, ecmData, '.ecm');
}

async function renderSkin(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: (path: string) => Promise<Uint8Array | null>,
  skiPath: string,
): Promise<void> {
  await ensureThree();
  const getFile = async (path: string) => {
    try { return await getFileRaw(path); }
    catch (e: unknown) { console.warn('[model] getFile failed:', path, e instanceof Error ? e.message : e); return null; }
  };

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

// ── React Component ──

export function ModelViewer({ path, wasm, getData }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the current path to cancel stale loads
  const currentPathRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setError(null);
    currentPathRef.current = path;

    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    const render = ext === '.ecm' ? renderModel : renderSkin;

    render(container, wasm, getData, path).catch((e: unknown) => {
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
  }, [path, wasm, getData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dispose viewer only on component unmount (not path change)
  useEffect(() => {
    return () => {
      if (viewer) { viewer.dispose(); viewer = null; }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  if (error) {
    return <div className={styles.modelError}>{error}</div>;
  }

  return <div ref={containerRef} className={styles.modelContainer} />;
}
