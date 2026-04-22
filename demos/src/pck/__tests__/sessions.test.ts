import { describe, expect, it } from 'vitest';
import { fileFingerprint, sessionIdFromFileIds } from '../history/types';

describe('fileFingerprint', () => {
  it('is stable for the same name+size+mtime', () => {
    const a = fileFingerprint({ name: 'gfx.pck', size: 1024, lastModified: 12345 });
    const b = fileFingerprint({ name: 'gfx.pck', size: 1024, lastModified: 12345 });
    expect(a).toBe(b);
  });

  it('differs when size differs', () => {
    const a = fileFingerprint({ name: 'gfx.pck', size: 1024, lastModified: 1 });
    const b = fileFingerprint({ name: 'gfx.pck', size: 2048, lastModified: 1 });
    expect(a).not.toBe(b);
  });

  it('lowercases the name so case-only renames collapse', () => {
    const a = fileFingerprint({ name: 'Gfx.PCK', size: 1024, lastModified: 1 });
    const b = fileFingerprint({ name: 'gfx.pck', size: 1024, lastModified: 1 });
    expect(a).toBe(b);
  });
});

describe('sessionIdFromFileIds', () => {
  it('is stable for the same set regardless of input order', () => {
    const a = sessionIdFromFileIds(['gfx|1|1', 'models|2|2', 'fonts|3|3']);
    const b = sessionIdFromFileIds(['models|2|2', 'fonts|3|3', 'gfx|1|1']);
    expect(a).toBe(b);
  });

  it('differs when the set differs', () => {
    const a = sessionIdFromFileIds(['gfx|1|1', 'models|2|2']);
    const b = sessionIdFromFileIds(['gfx|1|1', 'models|2|2', 'ui|3|3']);
    expect(a).not.toBe(b);
  });

  it('produces an empty string for an empty set', () => {
    expect(sessionIdFromFileIds([])).toBe('');
  });

  it('keeps single-file sessions distinct by fingerprint', () => {
    const a = sessionIdFromFileIds(['gfx|1|1']);
    const b = sessionIdFromFileIds(['gfx|2|1']);
    expect(a).not.toBe(b);
  });
});
