import { useEffect, useMemo, useRef } from 'react';
import { ensureThree, getThree } from '@shared/components/model-viewer/internal/three';
import { useFileData } from '@shared/hooks/useFileData';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';
import { d3dBlendToThreeFactor } from './blend';
import { loadParticleTexture, resolveTexturePath } from './texture';
import { createSimState, resolvePoolSize, tickSim, type ShapeCfg, type SimConfig } from './simulation';

type ParticleBody = Extract<ElementBody, { kind: 'particle' }>;

/**
 * Drives the three.js scene for a Point-emitter particle element.
 *
 * The hook exposes two refs: one for the canvas container, one for the
 * readout <div> that the simulation writes directly via textContent
 * (avoids React state churn at 60 Hz). Scene + rAF loop are built in
 * an effect once the resolved texture (or lack thereof) is known.
 */
export function useParticleCanvas(
  body: ParticleBody,
  element: GfxElement,
  context: ViewerCtx,
): {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  readoutRef: React.RefObject<HTMLDivElement | null>;
} {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);

  const resolvedPath = useMemo(
    () => resolveTexturePath(element.tex_file, context.listFiles),
    [element.tex_file, context.listFiles],
  );

  // Fetch file data when we have a resolved path. If resolution failed
  // (listFiles present but no match), skip the fetch and render with
  // white material as designed — missing textures are non-fatal.
  const texDataState = useFileData(
    resolvedPath ?? '__noop__',
    resolvedPath ? context.getData : noopGetData,
  );

  // Stable dep for the scene-rebuild effect: only the successfully-loaded
  // bytes matter, not intermediate loading/error states.
  const texData = useMemo(
    () => (texDataState.status === 'loaded' ? texDataState.data : null),
    [texDataState],
  );

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    let cancelled = false;
    const cleanupFns: Array<() => void> = [];

    (async () => {
      await ensureThree();
      if (cancelled) return;
      const { THREE, OrbitControls } = getThree();

      // --- Scene, renderer, camera -------------------------------------
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      const initialW = container.clientWidth || 400;
      const initialH = container.clientHeight || 360;
      renderer.setSize(initialW, initialH);
      container.replaceChildren(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = readBgColor(THREE, container);

      const camera = new THREE.PerspectiveCamera(50, initialW / initialH, 0.01, 100);
      camera.position.set(0, 0.6, 2.5);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;

      // Lights (matches design doc spec).
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const dir = new THREE.DirectionalLight(0xffffff, 0.5);
      dir.position.set(5, 10, 7);
      scene.add(dir);

      // --- Emission-cone wireframe -------------------------------------
      const emitterAngle = body.emitter.angle ?? 0;
      const parIniDir: [number, number, number] = body.emitter.par_ini_dir ?? [0, 0, 1];
      let coneMesh: any = null;
      let coneGeo: any = null;
      let coneMat: any = null;
      if (emitterAngle > 0) {
        const height = 0.5;
        const radius = height * Math.tan(emitterAngle);
        coneGeo = new THREE.ConeGeometry(radius, height, 24, 1, true);
        coneMat = new THREE.LineBasicMaterial({
          color: 0xcbf56a,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        });
        const edges = new THREE.EdgesGeometry(coneGeo);
        coneMesh = new THREE.LineSegments(edges, coneMat);
        // ConeGeometry apex points along +Y by default; orient apex at origin
        // with body toward parIniDir.
        orientConeToAxis(THREE, coneMesh, parIniDir, height);
        scene.add(coneMesh);
        cleanupFns.push(() => {
          edges.dispose();
        });
      }

      // --- Simulation config (drives both GPU pool size and sim cap) ----
      const atlasRows = Math.max(1, element.tex_row);
      const atlasCols = Math.max(1, element.tex_col);
      const cfg = buildSimConfig(body, element, atlasRows, atlasCols);
      const quota = cfg.quota;

      // --- InstancedMesh + shader material -----------------------------
      let texture: any = null;
      if (texData && texData.byteLength > 0) {
        try {
          texture = await loadParticleTexture(context.wasm, texData, element.tex_file);
        } catch (e) {
          console.warn('[particle] texture load failed:', e);
          texture = null;
        }
        if (cancelled) {
          if (texture?.dispose) texture.dispose();
          return;
        }
      }

      const geom = new THREE.PlaneGeometry(1, 1);
      // Per-instance attributes: alpha + atlasFrame.
      const instAlpha = new Float32Array(quota);
      const instAtlas = new Float32Array(quota);
      geom.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(instAlpha, 1));
      geom.setAttribute('instanceAtlas', new THREE.InstancedBufferAttribute(instAtlas, 1));

      const srcFactor = d3dBlendToThreeFactor(element.src_blend, THREE);
      const dstFactor = d3dBlendToThreeFactor(element.dest_blend, THREE);

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: texture },
          uHasTex: { value: texture ? 1 : 0 },
          uAtlasCols: { value: atlasCols },
          uAtlasRows: { value: atlasRows },
        },
        vertexShader: PARTICLE_VERT,
        fragmentShader: PARTICLE_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: srcFactor !== null && dstFactor !== null
          ? THREE.CustomBlending
          : THREE.NormalBlending,
        blendSrc: srcFactor ?? THREE.SrcAlphaFactor,
        blendDst: dstFactor ?? THREE.OneMinusSrcAlphaFactor,
        blendEquation: THREE.AddEquation,
      });

      if (srcFactor === null || dstFactor === null) {
        console.warn(
          '[particle] unknown D3DBLEND factor(s):',
          element.src_blend,
          element.dest_blend,
          '— falling back to NormalBlending',
        );
      }

      const mesh = new THREE.InstancedMesh(geom, material, quota);
      mesh.count = 0;
      mesh.frustumCulled = false; // particles bloom beyond initial bounds
      // Ensure instanceColor is allocated so we can set per-instance RGB.
      if (!mesh.instanceColor) {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(quota * 3),
          3,
        );
      }
      scene.add(mesh);

      // --- Simulation state + rAF loop ---------------------------------
      const state = createSimState(30);
      const rng = Math.random;

      const tmpMat = new THREE.Matrix4();
      const tmpQuat = new THREE.Quaternion();
      const tmpPos = new THREE.Vector3();
      const tmpScale = new THREE.Vector3();
      const tmpColor = new THREE.Color();
      const zAxis = new THREE.Vector3(0, 0, 1);

      const shapeLabel = body.emitter.shape.shape;
      let animId = 0;
      let lastTs = performance.now();
      let lastAlive = -1;

      function writeInstances() {
        const alive = state.alive;
        const count = alive.length;
        const baseScaleX = cfg.particleWidth;
        const baseScaleY = cfg.particleHeight;

        // Position is integrated every frame → matrix always needs a write.
        for (let i = 0; i < count; i++) {
          const p = alive[i];
          tmpPos.set(p.px, p.py, p.pz);
          tmpQuat.setFromAxisAngle(zAxis, p.rot);
          tmpScale.set(p.scale * baseScaleX, p.scale * baseScaleY, 1);
          tmpMat.compose(tmpPos, tmpQuat, tmpScale);
          mesh.setMatrixAt(i, tmpMat);
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;

        // Color / alpha / atlas are sampled at spawn and held for life —
        // only rewrite slots that changed ownership this tick (births +
        // swap-remove targets).
        const dirty = state.dirtyIndices;
        if (dirty.length > 0) {
          for (let k = 0; k < dirty.length; k++) {
            const i = dirty[k];
            if (i >= count) continue;
            const p = alive[i];
            tmpColor.setRGB(p.r, p.g, p.b);
            mesh.setColorAt(i, tmpColor);
            instAlpha[i] = p.a;
            instAtlas[i] = p.atlasFrame;
          }
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          (geom.attributes.instanceAlpha as any).needsUpdate = true;
          (geom.attributes.instanceAtlas as any).needsUpdate = true;
        }
      }

      function updateReadout(alive: number) {
        if (alive === lastAlive) return;
        lastAlive = alive;
        const r = readoutRef.current;
        if (!r) return;
        r.textContent = `${alive} ALIVE · ${cfg.emissionRate.toFixed(0)}/s · ${cfg.ttl.toFixed(1)}s TTL · ${shapeLabel}`;
      }

      function animate(ts: number) {
        animId = requestAnimationFrame(animate);
        const dt = Math.min(0.1, (ts - lastTs) / 1000);
        lastTs = ts;
        const alive = tickSim(dt, state, cfg, rng);
        writeInstances();
        updateReadout(alive);
        controls.update();
        renderer.render(scene, camera);
      }
      animId = requestAnimationFrame(animate);
      cleanupFns.push(() => cancelAnimationFrame(animId));

      // Resize observer.
      const resize = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        }
      });
      resize.observe(container);
      cleanupFns.push(() => resize.disconnect());

      cleanupFns.push(() => {
        controls.dispose();
        mesh.geometry.dispose();
        material.dispose();
        if (texture?.dispose) texture.dispose();
        if (coneMat) coneMat.dispose();
        if (coneGeo) coneGeo.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      });
    })();

    return () => {
      cancelled = true;
      for (const fn of cleanupFns.reverse()) {
        try { fn(); } catch (e) { console.warn('[particle] cleanup failed:', e); }
      }
    };
  // Rebuild the whole scene when the loaded texture data or body/element
  // reference changes. Context fields are stable across re-renders (parent
  // memoizes), so we depend on them directly rather than the whole object.
  }, [body, element, context.wasm, context.getData, texData]);

  return { canvasRef, readoutRef };
}

// --- Helpers ---------------------------------------------------------------

function noopGetData(_: string): Promise<Uint8Array> {
  return Promise.resolve(new Uint8Array());
}

function readBgColor(THREE: any, container: HTMLElement): any {
  try {
    const raw = getComputedStyle(container).getPropertyValue('--gfx-bg-deep').trim();
    if (raw) return new THREE.Color(raw);
  } catch {
    /* computed-style read may fail in edge cases; fall through */
  }
  return new THREE.Color(0x0b0b0d);
}

function orientConeToAxis(
  THREE: any,
  mesh: any,
  axis: [number, number, number],
  height: number,
): void {
  // ConeGeometry: apex at (0, height/2, 0), base at (0, -height/2, 0).
  // We want: apex at origin, body toward `axis`.
  // Start by translating up so the apex sits at origin when +Y aligned.
  const ax = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
  const defaultAxis = new THREE.Vector3(0, 1, 0);
  mesh.position.set(0, 0, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(defaultAxis, ax);
  mesh.quaternion.copy(quat);
  // Offset along axis by -height/2 so apex sits at origin.
  const offset = new THREE.Vector3().copy(ax).multiplyScalar(height * 0.5);
  mesh.position.copy(offset);
}

function buildSimConfig(
  body: ParticleBody,
  element: GfxElement,
  atlasRows: number,
  atlasCols: number,
): SimConfig {
  const e = body.emitter;
  const parIniDir: [number, number, number] = e.par_ini_dir ?? [0, 0, 1];
  return {
    quota: resolvePoolSize(body.quota, e.emission_rate, e.ttl),
    emissionRate: e.emission_rate,
    ttl: e.ttl,
    angle: e.angle,
    speed: e.speed,
    parAcc: e.par_acc ?? 0,
    acc: e.acc,
    accDir: e.acc_dir,
    dragPow: e.drag_pow,
    colorMin: e.color_min,
    colorMax: e.color_max,
    scaleMin: e.scale_min,
    scaleMax: e.scale_max,
    rotMin: e.rot_min ?? 0,
    rotMax: e.rot_max ?? 0,
    parIniDir,
    atlasRows,
    atlasCols,
    atlasFrames: atlasRows * atlasCols,
    initRandomTexture: !!body.init_random_texture,
    particleWidth: body.particle_width,
    particleHeight: body.particle_height,
    shape: { kind: 'point' } satisfies ShapeCfg,
  };
}

// --- Shaders --------------------------------------------------------------

// Vertex: billboard each instance's quad to the camera. ShaderMaterial
// auto-injects `position`, `uv`, `instanceMatrix`, `instanceColor`,
// `modelViewMatrix`, `projectionMatrix` — we only declare our custom
// per-instance attributes and uniforms.
const PARTICLE_VERT = /* glsl */ `
attribute float instanceAlpha;
attribute float instanceAtlas;

uniform float uAtlasCols;
uniform float uAtlasRows;

varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
  // Extract translation + scale + rotation from the instance matrix.
  vec3 instTranslate = instanceMatrix[3].xyz;
  vec2 instScale = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));

  // Per-quad rotation around the view-z axis, recovered from the
  // instance-matrix's scaled local-x (which is (scale*cos, scale*sin, 0)).
  vec3 localX = instanceMatrix[0].xyz / max(instScale.x, 1e-6);
  float cosR = localX.x;
  float sinR = localX.y;
  float rx = cosR * position.x - sinR * position.y;
  float ry = sinR * position.x + cosR * position.y;

  // Billboard: push the world translation into view space, offset along
  // view-space right/up, then project. Keeps the quad facing the camera
  // regardless of particle rotation or world orientation.
  vec4 mvPos = modelViewMatrix * vec4(instTranslate, 1.0);
  mvPos.xy += vec2(rx * instScale.x, ry * instScale.y);
  gl_Position = projectionMatrix * mvPos;

  // Atlas UV: shift quad-local [0,1] into the tile for this instance.
  float col = mod(instanceAtlas, uAtlasCols);
  float row = floor(instanceAtlas / uAtlasCols);
  vec2 tileSize = vec2(1.0 / uAtlasCols, 1.0 / uAtlasRows);
  vUv = vec2(col, row) * tileSize + uv * tileSize;

  vColor = instanceColor;
  vAlpha = instanceAlpha;
}
`;

const PARTICLE_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
uniform sampler2D uTex;
uniform int uHasTex;

void main() {
  vec4 tex = vec4(1.0, 1.0, 1.0, 1.0);
  if (uHasTex == 1) {
    tex = texture2D(uTex, vUv);
  }
  gl_FragColor = vec4(tex.rgb * vColor, tex.a * vAlpha);
}
`;
