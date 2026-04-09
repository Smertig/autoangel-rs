import { renderCanvasImage, detectEncoding, decodeText, hexDumpRows } from '../pck-common.js';

let THREE = null;
let OrbitControls = null;
let threeLoading = null;

async function ensureThree() {
  if (THREE) return;
  if (threeLoading) return threeLoading;
  threeLoading = (async () => {
    THREE = await import('three');
    const addons = await import('three/addons/controls/OrbitControls.js');
    OrbitControls = addons.OrbitControls;
  })();
  return threeLoading;
}

function resolveRelative(parentPath, basename) {
  const dir = parentPath.substring(0, parentPath.lastIndexOf('\\') + 1);
  return (dir + basename).toLowerCase();
}

// ── Persistent viewer (one renderer, one canvas, reused across loads) ──

let viewer = null;

function getViewer(container) {
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

  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    if (viewer && viewer.controls) viewer.controls.update();
    if (viewer && viewer.scene) renderer.render(viewer.scene, viewer.camera);
  }
  animate();

  viewer = {
    container, renderer, resizeObs,
    scene: null, camera: null, controls: null,
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
      this.scene.traverse(c => {
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

// ── Shared: load a single SKI into meshes ──

async function loadSkinFile(wasm, getFile, skiArchivePath, skiData) {
  const skin = wasm.WasmSkin.parse(skiData);
  const stats = { verts: 0, tris: 0, meshes: 0, textures: 0 };
  const meshes = [];

  try {
    // Texture path candidates per A3DSkin.cpp: Textures\ first, then Tex_<skinname>\
    const textureNames = skin.textures || [];
    const skiBasename = skiArchivePath.split('\\').pop().replace(/\.ski$/i, '');
    const textures = await Promise.all(textureNames.map(async (texName) => {
      const candidates = [
        resolveRelative(skiArchivePath, 'textures\\' + texName),
        resolveRelative(skiArchivePath, 'tex_' + skiBasename + '\\' + texName),
        resolveRelative(skiArchivePath, texName),
      ];
      for (const tp of candidates) {
        const texData = await getFile(tp);
        if (texData) return ddsToThreeTexture(texData);
      }
      console.warn('[model] Texture not found:', texName);
      return null;
    }));
    stats.textures = textures.filter(t => t).length;

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

// ── Shared: build scene and mount into viewer ──

function mountScene(container, group, totalStats, sourceData, sourceExt) {
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
  toolbar.className = 'model-toolbar';

  const wireBtn = makeToolbarBtn('Wireframe', () => {
    wireBtn._on = !wireBtn._on;
    group.traverse(c => { if (c.material) c.material.wireframe = wireBtn._on; });
    wireBtn.classList.toggle('btn-active', wireBtn._on);
  });
  toolbar.appendChild(wireBtn);

  const bgBtn = makeToolbarBtn('Light BG', () => {
    bgBtn._on = !bgBtn._on;
    scene.background = new THREE.Color(bgBtn._on ? 0xe0e0e0 : 0x2a2a2a);
    bgBtn.classList.toggle('btn-active', bgBtn._on);
  });
  toolbar.appendChild(bgBtn);

  const resetBtn = makeToolbarBtn('Reset Camera', () => {
    v.camera.position.copy(center).add(defaultCamOffset);
    v.controls.target.copy(center);
    v.controls.update();
  });
  toolbar.appendChild(resetBtn);

  const sep = document.createElement('div');
  sep.className = 'model-toolbar-sep';
  toolbar.appendChild(sep);

  const modeGroup = document.createElement('div');
  modeGroup.className = 'model-mode-group';
  const mode3d = makeToolbarBtn('3D', null);
  const modeSrc = makeToolbarBtn('Source', null);
  mode3d.classList.add('btn-active');
  modeGroup.append(mode3d, modeSrc);
  toolbar.appendChild(modeGroup);

  const info = document.createElement('div');
  info.className = 'model-info';
  info.innerHTML =
    `<span>${totalStats.meshes} mesh${totalStats.meshes !== 1 ? 'es' : ''}</span>` +
    `<span>${totalStats.verts.toLocaleString()} verts</span>` +
    `<span>${Math.round(totalStats.tris).toLocaleString()} tris</span>` +
    `<span>${totalStats.textures} tex</span>`;

  // Source view (lazy-built)
  let sourceEl = null;
  function getSourceEl() {
    if (sourceEl) return sourceEl;
    sourceEl = document.createElement('div');
    sourceEl.className = 'model-source';
    if (sourceData && (sourceExt === '.ecm' || sourceExt === '.gfx')) {
      // Text file — decode and show
      const encoding = detectEncoding(sourceData);
      const text = decodeText(sourceData, encoding);
      const pre = document.createElement('pre');
      pre.textContent = text;
      sourceEl.appendChild(pre);
    } else if (sourceData) {
      // Binary — hex dump
      sourceEl.appendChild(buildHexDump(sourceData));
    }
    return sourceEl;
  }

  const canvas = v.renderer.domElement;

  // Mode switching
  mode3d.onclick = () => {
    mode3d.classList.add('btn-active');
    modeSrc.classList.remove('btn-active');
    container.replaceChildren(canvas, toolbar, info);
    wireBtn.style.display = bgBtn.style.display = resetBtn.style.display = '';
  };
  modeSrc.onclick = () => {
    modeSrc.classList.add('btn-active');
    mode3d.classList.remove('btn-active');
    container.replaceChildren(getSourceEl(), toolbar);
    wireBtn.style.display = bgBtn.style.display = resetBtn.style.display = 'none';
  };

  container.replaceChildren(canvas, toolbar, info);

  return () => { if (viewer) { viewer.dispose(); viewer = null; } container.innerHTML = ''; };
}

// Worker's getFile throws on not-found; wrap to return null so path
// candidate loops can fall through instead of aborting the whole render.
function wrapGetFile(getFileRaw) {
  return async (path) => {
    try { return await getFileRaw(path); }
    catch (e) { console.warn('[model] getFile failed:', path, e.message || e); return null; }
  };
}

// ── Public: render ECM (full chain) ──

export async function renderModel(container, wasm, getFileRaw, ecmPath) {
  await ensureThree();
  const getFile = wrapGetFile(getFileRaw);

  const ecmData = await getFile(ecmPath);
  if (!ecmData) throw new Error(`File not found: ${ecmPath}`);
  const ecm = wasm.EcmModel.parse(ecmData);

  const smdRelPath = ecm.skinModelPath;
  const smdPath = smdRelPath.includes('\\')
    ? smdRelPath.toLowerCase()
    : resolveRelative(ecmPath, smdRelPath);
  const smdData = await getFile(smdPath);
  let smdSkinPaths = [];
  if (smdData) {
    const smd = wasm.SmdModel.parse(smdData);
    try { smdSkinPaths = smd.skinPaths || []; } finally { smd.free(); }
  }

  const allSkinPaths = [];
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
  const totalStats = { verts: 0, tris: 0, meshes: 0, textures: 0 };

  for (const skiPath of allSkinPaths) {
    let skiData = await getFile(skiPath);
    let skiArchivePath = skiPath;
    // AddiSkinPath may omit a prefix present in archive paths (engine prepends "Models\")
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

  return mountScene(container, group, totalStats, ecmData, '.ecm');
}

// ── Public: render SKI directly ──

export async function renderSkin(container, wasm, getFileRaw, skiPath) {
  await ensureThree();
  const getFile = wrapGetFile(getFileRaw);

  const skiData = await getFile(skiPath);
  if (!skiData) throw new Error(`File not found: ${skiPath}`);

  const group = new THREE.Group();
  const { meshes, stats } = await loadSkinFile(wasm, getFile, skiPath, skiData);
  for (const m of meshes) group.add(m);

  if (group.children.length === 0) {
    throw new Error('No meshes could be built from skin file');
  }

  return mountScene(container, group, stats, skiData, '.ski');
}

// ── Helpers ──

function makeToolbarBtn(label, onclick) {
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = label;
  btn._on = false;
  btn.onclick = onclick;
  return btn;
}

function buildMesh(skin, index, textures, kind) {
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

function buildHexDump(data) {
  const rows = hexDumpRows(data);
  const lines = rows.map(r => `${r.offset}  ${r.hex}  ${r.ascii}`);
  if (data.length > 4096) lines.push(`\n... (${data.length.toLocaleString()} bytes total)`);
  const pre = document.createElement('pre');
  pre.className = 'hex-dump';
  pre.textContent = lines.join('\n');
  return pre;
}

function ddsToThreeTexture(data) {
  try {
    const { canvas } = renderCanvasImage(data, '.dds');

    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    let hasAlpha = false;
    for (let i = 3; i < pixels.length; i += 4 * 64) {
      if (pixels[i] < 250) { hasAlpha = true; break; }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex._hasAlpha = hasAlpha;
    return tex;
  } catch (e) {
    console.warn('[model] DDS decode failed:', e.message || e);
    return null;
  }
}
