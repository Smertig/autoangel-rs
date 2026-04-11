import { describe, it, expect } from 'vitest';
import { hexDumpRows } from '../hex';

describe('hexDumpRows', () => {
  it('returns empty array for empty input', () => {
    expect(hexDumpRows(new Uint8Array([]))).toEqual([]);
  });

  it('produces one row for 16 bytes', () => {
    const data = new Uint8Array(16).fill(0x41); // 16 'A's
    const rows = hexDumpRows(data);
    expect(rows).toHaveLength(1);
  });

  it('produces two rows for 17 bytes', () => {
    const data = new Uint8Array(17).fill(0x41);
    const rows = hexDumpRows(data);
    expect(rows).toHaveLength(2);
  });

  it('produces correct number of rows for 32 bytes', () => {
    const data = new Uint8Array(32).fill(0x41);
    expect(hexDumpRows(data)).toHaveLength(2);
  });

  it('offset field is zero-padded 8-char hex', () => {
    const data = new Uint8Array(32).fill(0x41);
    const rows = hexDumpRows(data);
    expect(rows[0].offset).toBe('00000000');
    expect(rows[1].offset).toBe('00000010');
  });

  it('offset increments by 16 per row', () => {
    const data = new Uint8Array(48).fill(0x41);
    const rows = hexDumpRows(data);
    expect(rows[0].offset).toBe('00000000');
    expect(rows[1].offset).toBe('00000010');
    expect(rows[2].offset).toBe('00000020');
  });

  it('hex field contains space-separated hex bytes', () => {
    const data = new Uint8Array([0x00, 0x0F, 0xFF, 0xAB]);
    const rows = hexDumpRows(data);
    expect(rows[0].hex.trimEnd()).toBe('00 0f ff ab');
  });

  it('hex field is padded to 47 characters', () => {
    // A full 16-byte row: 16*2 hex digits + 15 spaces = 47 chars
    const data = new Uint8Array(16).fill(0x41);
    expect(hexDumpRows(data)[0].hex.length).toBe(47);
  });

  it('partial last row hex is padded to 47 characters', () => {
    const data = new Uint8Array(4).fill(0x41);
    expect(hexDumpRows(data)[0].hex.length).toBe(47);
  });

  it('ascii field shows printable chars as-is', () => {
    const data = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
    const rows = hexDumpRows(data);
    expect(rows[0].ascii).toBe('Hello');
  });

  it('ascii field shows . for non-printable bytes', () => {
    const data = new Uint8Array([0x00, 0x01, 0x1F, 0x7F, 0x80, 0xFF]);
    const rows = hexDumpRows(data);
    expect(rows[0].ascii).toBe('......');
  });

  it('ascii shows 0x20 (space) as printable', () => {
    const data = new Uint8Array([0x20]);
    expect(hexDumpRows(data)[0].ascii).toBe(' ');
  });

  it('ascii shows 0x7E (~) as printable', () => {
    const data = new Uint8Array([0x7E]);
    expect(hexDumpRows(data)[0].ascii).toBe('~');
  });

  it('ascii shows 0x7F as dot (not printable)', () => {
    const data = new Uint8Array([0x7F]);
    expect(hexDumpRows(data)[0].ascii).toBe('.');
  });

  it('truncates to maxBytes (default 4096)', () => {
    const data = new Uint8Array(8192).fill(0x41);
    const rows = hexDumpRows(data);
    // 4096 / 16 = 256 rows
    expect(rows).toHaveLength(256);
  });

  it('respects custom maxBytes', () => {
    const data = new Uint8Array(100).fill(0x41);
    const rows = hexDumpRows(data, 32);
    expect(rows).toHaveLength(2);
  });

  it('maxBytes of 0 returns empty array', () => {
    const data = new Uint8Array(100).fill(0x41);
    expect(hexDumpRows(data, 0)).toEqual([]);
  });

  it('row structure has exactly offset, hex, ascii fields', () => {
    const data = new Uint8Array([0x41]);
    const row = hexDumpRows(data)[0];
    expect(Object.keys(row).sort()).toEqual(['ascii', 'hex', 'offset']);
  });

  it('handles mixed printable and non-printable in ascii', () => {
    const data = new Uint8Array([0x48, 0x00, 0x65, 0x01, 0x6C, 0xFF, 0x6C, 0x7F, 0x6F]);
    const rows = hexDumpRows(data);
    expect(rows[0].ascii).toBe('H.e.l.l.o');
  });

  it('large offset is formatted correctly', () => {
    // 256 rows * 16 bytes each = offset of 0x1000 at row 256
    const data = new Uint8Array(256 * 16 + 1).fill(0x41);
    const rows = hexDumpRows(data, 256 * 16 + 1);
    expect(rows[256].offset).toBe('00001000');
  });
});
