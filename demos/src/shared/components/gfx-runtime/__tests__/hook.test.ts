import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { attachToHook } from '../hook';

describe('attachToHook', () => {
  const bone = (name: string, pos: [number, number, number]) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    return b;
  };

  // Wrap a flat list of named Object3Ds in the resolver the real caller builds
  // in render-smd.ts — same prefer-hooks-then-bones logic, minimized to what
  // each test needs.
  const resolverFrom = (pts: any[]) => (name: string) =>
    name ? pts.find((p) => p.name === name) : undefined;

  it('attaches to the named attach point when bindParent=true', () => {
    const runtimeRoot = new THREE.Group();
    const bones = [bone('HH_hand', [0, 1, 0])];
    const sceneRoot = new THREE.Group();
    attachToHook(runtimeRoot, {
      hookName: 'HH_hand',
      hookOffset: [0, 0, 0],
      hookYaw: 0, hookPitch: 0, hookRot: 0,
      bindParent: true,
    }, resolverFrom(bones), sceneRoot);
    expect(runtimeRoot.parent).toBe(bones[0]);
  });

  it('prefers hook Object3Ds over bones of the same name', () => {
    const runtimeRoot = new THREE.Group();
    const boneFallback = bone('HH_zui', [0, 0, 0]);
    const hookObj = new THREE.Group();
    hookObj.name = 'HH_zui';
    const sceneRoot = new THREE.Group();
    // The resolver used in render-smd.ts always checks hooks before bones.
    const findAttachPoint = (name: string) => {
      if (!name) return undefined;
      if (name === 'HH_zui') return hookObj;
      return [boneFallback].find((b) => b.name === name);
    };
    attachToHook(runtimeRoot, {
      hookName: 'HH_zui',
      hookOffset: [0, 0, 0],
      hookYaw: 0, hookPitch: 0, hookRot: 0,
      bindParent: true,
    }, findAttachPoint, sceneRoot);
    expect(runtimeRoot.parent).toBe(hookObj);
  });

  it('falls back to sceneRoot when hookName is empty or missing', () => {
    const runtimeRoot = new THREE.Group();
    const bones = [bone('HH_hand', [0, 1, 0])];
    const sceneRoot = new THREE.Group();
    attachToHook(runtimeRoot, {
      hookName: '', hookOffset: [0, 0, 0],
      hookYaw: 0, hookPitch: 0, hookRot: 0,
      bindParent: true,
    }, resolverFrom(bones), sceneRoot);
    expect(runtimeRoot.parent).toBe(sceneRoot);
  });

  it('freezes at spawn location when bindParent=false', () => {
    const runtimeRoot = new THREE.Group();
    const b = bone('HH_hand', [0, 1, 0]);
    b.updateMatrixWorld(true);
    const sceneRoot = new THREE.Group();
    attachToHook(runtimeRoot, {
      hookName: 'HH_hand', hookOffset: [0, 0, 0],
      hookYaw: 0, hookPitch: 0, hookRot: 0,
      bindParent: false,
    }, resolverFrom([b]), sceneRoot);
    expect(runtimeRoot.parent).toBe(sceneRoot);
    expect(runtimeRoot.position.y).toBeCloseTo(1);
  });

  it('hookName not resolved falls back to sceneRoot (with bindParent=true)', () => {
    const runtimeRoot = new THREE.Group();
    const sceneRoot = new THREE.Group();
    attachToHook(runtimeRoot, {
      hookName: 'HH_missing',
      hookOffset: [0, 0, 0],
      hookYaw: 0, hookPitch: 0, hookRot: 0,
      bindParent: true,
    }, resolverFrom([]), sceneRoot);
    expect(runtimeRoot.parent).toBe(sceneRoot);
  });
});
