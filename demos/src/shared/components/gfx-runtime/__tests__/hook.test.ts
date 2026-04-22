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

  it('attaches to the named bone when bindParent=true', () => {
    const runtimeRoot = new THREE.Group();
    const bones = [bone('HH_hand', [0, 1, 0])];
    const sceneRoot = new THREE.Group();
    attachToHook(runtimeRoot, {
      hookName: 'HH_hand',
      hookOffset: [0, 0, 0],
      hookYaw: 0, hookPitch: 0, hookRot: 0,
      bindParent: true,
    }, bones, sceneRoot);
    expect(runtimeRoot.parent).toBe(bones[0]);
  });

  it('falls back to sceneRoot when hookName is empty or missing', () => {
    const runtimeRoot = new THREE.Group();
    const bones = [bone('HH_hand', [0, 1, 0])];
    const sceneRoot = new THREE.Group();
    attachToHook(runtimeRoot, {
      hookName: '', hookOffset: [0, 0, 0],
      hookYaw: 0, hookPitch: 0, hookRot: 0,
      bindParent: true,
    }, bones, sceneRoot);
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
    }, [b], sceneRoot);
    expect(runtimeRoot.parent).toBe(sceneRoot);
    expect(runtimeRoot.position.y).toBeCloseTo(1);
  });

  it('hookName not in bones falls back to sceneRoot (with bindParent=true)', () => {
    const runtimeRoot = new THREE.Group();
    const sceneRoot = new THREE.Group();
    attachToHook(runtimeRoot, {
      hookName: 'HH_missing',
      hookOffset: [0, 0, 0],
      hookYaw: 0, hookPitch: 0, hookRot: 0,
      bindParent: true,
    }, [], sceneRoot);
    expect(runtimeRoot.parent).toBe(sceneRoot);
  });
});
