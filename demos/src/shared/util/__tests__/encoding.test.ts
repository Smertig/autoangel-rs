import { describe, it, expect } from 'vitest';
import { detectBOM, detectUTF16Pattern, detectEncoding, decodeText } from '../encoding';

describe('detectBOM', () => {
  it('detects UTF-8 BOM (EF BB BF)', () => {
    const data = new Uint8Array([0xEF, 0xBB, 0xBF, 0x68, 0x65, 0x6C, 0x6C, 0x6F]);
    expect(detectBOM(data)).toEqual({ encoding: 'utf-8', bomLength: 3 });
  });

  it('detects UTF-16LE BOM (FF FE)', () => {
    const data = new Uint8Array([0xFF, 0xFE, 0x68, 0x00]);
    expect(detectBOM(data)).toEqual({ encoding: 'utf-16le', bomLength: 2 });
  });

  it('detects UTF-16BE BOM (FE FF)', () => {
    const data = new Uint8Array([0xFE, 0xFF, 0x00, 0x68]);
    expect(detectBOM(data)).toEqual({ encoding: 'utf-16be', bomLength: 2 });
  });

  it('returns null when no BOM present', () => {
    const data = new Uint8Array([0x68, 0x65, 0x6C, 0x6C, 0x6F]);
    expect(detectBOM(data)).toBeNull();
  });

  it('returns null for empty data', () => {
    expect(detectBOM(new Uint8Array([]))).toBeNull();
  });

  it('returns null for single byte', () => {
    expect(detectBOM(new Uint8Array([0xFF]))).toBeNull();
  });

  it('returns null for two bytes that are not a BOM', () => {
    expect(detectBOM(new Uint8Array([0x00, 0x00]))).toBeNull();
  });

  it('detects UTF-8 BOM with exactly 3 bytes', () => {
    const data = new Uint8Array([0xEF, 0xBB, 0xBF]);
    expect(detectBOM(data)).toEqual({ encoding: 'utf-8', bomLength: 3 });
  });

  it('detects UTF-16LE BOM with exactly 2 bytes', () => {
    const data = new Uint8Array([0xFF, 0xFE]);
    expect(detectBOM(data)).toEqual({ encoding: 'utf-16le', bomLength: 2 });
  });

  it('does not detect UTF-8 BOM with only 2 bytes (EF BB)', () => {
    const data = new Uint8Array([0xEF, 0xBB]);
    expect(detectBOM(data)).toBeNull();
  });
});

describe('detectUTF16Pattern', () => {
  it('returns null for data shorter than 4 bytes', () => {
    expect(detectUTF16Pattern(new Uint8Array([0x68, 0x00, 0x65]))).toBeNull();
    expect(detectUTF16Pattern(new Uint8Array([]))).toBeNull();
    expect(detectUTF16Pattern(new Uint8Array([0x68, 0x00]))).toBeNull();
  });

  it('detects utf-16le pattern (non-null byte followed by null)', () => {
    // Typical UTF-16LE ASCII: 'hello' => 68 00 65 00 6C 00 6C 00 6F 00
    const arr = [];
    for (const c of 'hello world foo bar baz') {
      arr.push(c.charCodeAt(0), 0x00);
    }
    const data = new Uint8Array(arr);
    expect(detectUTF16Pattern(data)).toBe('utf-16le');
  });

  it('detects utf-16be pattern (null byte followed by non-null)', () => {
    // Typical UTF-16BE ASCII: 'hello' => 00 68 00 65 00 6C 00 6C 00 6F
    const arr = [];
    for (const c of 'hello world foo bar baz') {
      arr.push(0x00, c.charCodeAt(0));
    }
    const data = new Uint8Array(arr);
    expect(detectUTF16Pattern(data)).toBe('utf-16be');
  });

  it('returns null for mixed data without clear pattern', () => {
    // Random non-zero bytes — neither pattern dominates
    const data = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x57, 0x6F]);
    expect(detectUTF16Pattern(data)).toBeNull();
  });

  it('uses at most 64 bytes for detection', () => {
    // Build 100 bytes of LE pattern
    const arr = [];
    for (let i = 0; i < 50; i++) arr.push(0x41, 0x00);
    const data = new Uint8Array(arr);
    expect(detectUTF16Pattern(data)).toBe('utf-16le');
  });
});

describe('detectEncoding', () => {
  it('returns gbk for data shorter than 2 bytes', () => {
    expect(detectEncoding(new Uint8Array([]))).toBe('gbk');
    expect(detectEncoding(new Uint8Array([0x41]))).toBe('gbk');
  });

  it('returns utf-8 when UTF-8 BOM present', () => {
    const data = new Uint8Array([0xEF, 0xBB, 0xBF, 0x41]);
    expect(detectEncoding(data)).toBe('utf-8');
  });

  it('returns utf-16le when UTF-16LE BOM present', () => {
    const data = new Uint8Array([0xFF, 0xFE, 0x41, 0x00]);
    expect(detectEncoding(data)).toBe('utf-16le');
  });

  it('returns utf-16be when UTF-16BE BOM present', () => {
    const data = new Uint8Array([0xFE, 0xFF, 0x00, 0x41]);
    expect(detectEncoding(data)).toBe('utf-16be');
  });

  it('falls back to UTF-16LE pattern detection', () => {
    const arr = [];
    for (const c of 'hello world foo bar baz') arr.push(c.charCodeAt(0), 0x00);
    expect(detectEncoding(new Uint8Array(arr))).toBe('utf-16le');
  });

  it('falls back to gbk when no BOM and no UTF-16 pattern', () => {
    const data = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
    expect(detectEncoding(data)).toBe('gbk');
  });
});

describe('decodeText', () => {
  it('decodes plain ASCII (utf-8)', () => {
    const data = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
    expect(decodeText(data, 'utf-8')).toBe('Hello');
  });

  it('skips UTF-8 BOM when encoding matches', () => {
    const data = new Uint8Array([0xEF, 0xBB, 0xBF, 0x48, 0x69]);
    expect(decodeText(data, 'utf-8')).toBe('Hi');
  });

  it('does not skip BOM when encoding differs', () => {
    // UTF-8 BOM bytes but decoding as gbk — BOM is not stripped
    const data = new Uint8Array([0xEF, 0xBB, 0xBF, 0x41]);
    const result = decodeText(data, 'gbk');
    // Should NOT be 'A' alone — the BOM bytes are included
    expect(result).not.toBe('A');
  });

  it('skips UTF-16LE BOM when encoding is utf-16le', () => {
    // BOM (FF FE) + 'A' in UTF-16LE (41 00)
    const data = new Uint8Array([0xFF, 0xFE, 0x41, 0x00]);
    expect(decodeText(data, 'utf-16le')).toBe('A');
  });

  it('skips UTF-16BE BOM when encoding is utf-16be', () => {
    // BOM (FE FF) + 'A' in UTF-16BE (00 41)
    const data = new Uint8Array([0xFE, 0xFF, 0x00, 0x41]);
    expect(decodeText(data, 'utf-16be')).toBe('A');
  });

  it('handles empty data', () => {
    expect(decodeText(new Uint8Array([]), 'utf-8')).toBe('');
  });
});
