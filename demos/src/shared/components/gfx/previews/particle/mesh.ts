// three.js binding for a particle simulation: owns an InstancedMesh + shader
// material + per-instance attribute buffers, and knows how to push SimState
// into them once per frame. Kept separate from the preview hook so the same
// binding can back both the ParticlePreview canvas and the upcoming ECM-side
// GFX runtime.

import type { SimConfig, SimState } from './simulation';

/**
 * Optional binding-time inputs the consumer supplies. The preview resolves a
 * texture + D3D→three blend factors ahead of calling this factory; the ECM
 * runtime may lazy-load them later. `null` is fine — the shader falls back to
 * a white-on-white quad with normal blending, which is also what the ECM
 * placeholder path wants before its texture pipeline is wired.
 */
export interface ParticleMeshInputs {
  texture?: any;
  srcBlend?: number | null; // THREE.*Factor constant or null → use default
  dstBlend?: number | null; // THREE.*Factor constant or null → use default
}

export interface ParticleMesh {
  readonly object3D: any; // THREE.Object3D (specifically THREE.InstancedMesh)
  writeState(state: SimState): void;
  dispose(): void;
}

export function createParticleMesh(
  cfg: SimConfig,
  inputs: ParticleMeshInputs | null,
  three: any,
): ParticleMesh {
  const THREE = three;
  const quota = cfg.quota;
  const texture = inputs?.texture ?? null;
  const srcFactor = inputs?.srcBlend ?? null;
  const dstFactor = inputs?.dstBlend ?? null;

  const geom = new THREE.PlaneGeometry(1, 1);
  // Per-instance attributes: alpha + atlasFrame.
  const instAlpha = new Float32Array(quota);
  const instAtlas = new Float32Array(quota);
  geom.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(instAlpha, 1));
  geom.setAttribute('instanceAtlas', new THREE.InstancedBufferAttribute(instAtlas, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: texture },
      uHasTex: { value: texture ? 1 : 0 },
      uAtlasCols: { value: cfg.atlasCols },
      uAtlasRows: { value: cfg.atlasRows },
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

  // Scratch objects reused every frame.
  const tmpMat = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const zAxis = new THREE.Vector3(0, 0, 1);

  const baseScaleX = cfg.particleWidth;
  const baseScaleY = cfg.particleHeight;

  function writeState(state: SimState): void {
    const alive = state.alive;
    const count = alive.length;

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

  function dispose(): void {
    geom.dispose();
    material.dispose();
    if (texture && typeof texture.dispose === 'function') {
      texture.dispose();
    }
  }

  return { object3D: mesh, writeState, dispose };
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
