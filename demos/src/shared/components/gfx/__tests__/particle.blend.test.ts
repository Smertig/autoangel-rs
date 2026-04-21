import { describe, it, expect } from 'vitest';
import { d3dBlendLabel, blendPresetName, formatBlendMode } from '../previews/particle/blend';

describe('d3dBlendLabel', () => {
  it('maps known D3DBLEND values to names', () => {
    expect(d3dBlendLabel(1)).toBe('Zero');
    expect(d3dBlendLabel(2)).toBe('One');
    expect(d3dBlendLabel(5)).toBe('SrcAlpha');
    expect(d3dBlendLabel(6)).toBe('InvSrcAlpha');
  });
  it('returns fallback for unknown values', () => {
    expect(d3dBlendLabel(99)).toBe('?99');
  });
});

describe('blendPresetName', () => {
  it('detects common presets', () => {
    expect(blendPresetName(5, 6)).toBe('alpha');
    expect(blendPresetName(5, 2)).toBe('additive');
    expect(blendPresetName(2, 2)).toBe('additive (no alpha)');
    expect(blendPresetName(1, 6)).toBe('premultiplied');
  });
  it('returns null for unknown combos', () => {
    expect(blendPresetName(3, 4)).toBeNull();
    expect(blendPresetName(99, 99)).toBeNull();
  });
});

describe('formatBlendMode', () => {
  it('combines label + preset', () => {
    expect(formatBlendMode(5, 6)).toBe('SrcAlpha / InvSrcAlpha  (alpha)');
    expect(formatBlendMode(5, 2)).toBe('SrcAlpha / One  (additive)');
  });
  it('omits preset parenthetical when unknown', () => {
    expect(formatBlendMode(3, 4)).toBe('SrcColor / InvSrcColor');
  });
});
