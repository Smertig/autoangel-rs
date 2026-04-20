import { describe, it, expect } from 'vitest';
import { argbToCss, argbToHex } from '../util/argb';

describe('argbToCss', () => {
  it('converts packed u32 ARGB to rgba() string with alpha in 0..1', () => {
    expect(argbToCss(0xFFFF8040)).toBe('rgba(255, 128, 64, 1)');
    expect(argbToCss(0x80808080)).toBe('rgba(128, 128, 128, 0.502)');
    expect(argbToCss(0x00000000)).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('argbToHex', () => {
  it('formats as 0xAARRGGBB uppercase', () => {
    expect(argbToHex(0xFFFF8040)).toBe('0xFFFF8040');
    expect(argbToHex(0x80800000)).toBe('0x80800000');
    expect(argbToHex(0)).toBe('0x00000000');
  });
});
