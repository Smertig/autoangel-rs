import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  _resetForTests,
  applyCacheInvalidation,
  loadCachedSlotIndex,
  putCachedSlotIndex,
} from '../idb';
import { SCHEMA_VERSION, type CachedSlotIndex, type Edge } from '../types';

const baseRecord = (over: Partial<CachedSlotIndex> = {}): CachedSlotIndex => ({
  fileId: 'gfx.pck|1024|1',
  schemaVersion: SCHEMA_VERSION,
  perTypeVersions: { ecm: 1, smd: 1 },
  edges: [],
  indexedAt: 0,
  ...over,
});

const edge = (over: Partial<Edge> = {}): Edge => ({
  fromPkgId: 1,
  fromPath: 'a.ecm',
  fromName: 'ecm',
  kind: 'skin-model',
  raw: 'a.smd',
  candidates: ['a.smd'],
  resolved: null,
  ...over,
});

beforeEach(async () => {
  await _resetForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('autoangel-pck-index');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('deleteDatabase blocked'));
  });
});

describe('idb roundtrip', () => {
  it('round-trips a record', async () => {
    await putCachedSlotIndex(baseRecord());
    const got = await loadCachedSlotIndex('gfx.pck|1024|1');
    expect(got?.fileId).toBe('gfx.pck|1024|1');
  });

  it('returns null for missing fileId', async () => {
    expect(await loadCachedSlotIndex('absent')).toBeNull();
  });
});

describe('applyCacheInvalidation', () => {
  const currentVersions = { ecm: 2, smd: 1 };

  it('drops entire record on schema mismatch', () => {
    const r = baseRecord({ schemaVersion: SCHEMA_VERSION + 99 });
    expect(applyCacheInvalidation(r, currentVersions)).toBeNull();
  });

  it('drops edges of types whose version bumped', () => {
    const r = baseRecord({
      perTypeVersions: { ecm: 1, smd: 1 },
      edges: [edge({ fromName: 'ecm' }), edge({ fromName: 'smd' })],
    });
    const out = applyCacheInvalidation(r, currentVersions);
    expect(out).not.toBeNull();
    expect(out!.edges.map((e) => e.fromName)).toEqual(['smd']);
    expect(out!.perTypeVersions.ecm).toBeUndefined();
    expect(out!.perTypeVersions.smd).toBe(1);
  });

  it('drops edges of removed extractors', () => {
    const r = baseRecord({
      perTypeVersions: { ecm: 1, gone: 1 },
      edges: [edge({ fromName: 'gone' }), edge({ fromName: 'ecm' })],
    });
    const out = applyCacheInvalidation(r, { ecm: 1 });
    expect(out!.edges.map((e) => e.fromName)).toEqual(['ecm']);
    expect(out!.perTypeVersions).toEqual({ ecm: 1 });
  });

  it('passes through unchanged when all versions match', () => {
    const r = baseRecord({ perTypeVersions: { ecm: 2, smd: 1 } });
    const out = applyCacheInvalidation(r, currentVersions);
    expect(out!.edges).toEqual(r.edges);
    expect(out!.perTypeVersions).toEqual(r.perTypeVersions);
  });

  it('keeps cursor entries when cursorVersions match current versions', () => {
    const r = baseRecord({
      perTypeVersions: {},
      cursor: { ecm: 100, smd: 50 },
      cursorVersions: { ecm: 1, smd: 1 },
    });
    const out = applyCacheInvalidation(r, currentVersions);
    // ecm bumped (1→2): drop. smd unchanged (1==1): keep.
    expect(out!.cursor).toEqual({ smd: 50 });
    expect(out!.cursorVersions).toEqual({ smd: 1 });
  });

  it('keeps in-progress edges when their cursorVersion matches', () => {
    const r = baseRecord({
      perTypeVersions: {},
      cursor: { smd: 50 },
      cursorVersions: { smd: 1 },
      edges: [edge({ fromName: 'smd' }), edge({ fromName: 'ecm' })],
    });
    const out = applyCacheInvalidation(r, currentVersions);
    // smd cursor is valid → keep its edges. ecm has no cursor and isn't
    // in perTypeVersions → drop.
    expect(out!.edges.map((e) => e.fromName)).toEqual(['smd']);
  });

  it('drops cursor entries with no cursorVersions metadata (older records)', () => {
    const r = baseRecord({
      perTypeVersions: { ecm: 1 },
      cursor: { ecm: 100, smd: 50 },
      // cursorVersions intentionally absent
    });
    const out = applyCacheInvalidation(r, currentVersions);
    // No cursor kept; ecm is dropped because version bumped.
    expect(out!.cursor).toBeUndefined();
  });

  it('drops cursor entirely when no entry has matching version', () => {
    const r = baseRecord({
      perTypeVersions: {},
      cursor: { ecm: 100 },
      cursorVersions: { ecm: 1 }, // current is 2
    });
    const out = applyCacheInvalidation(r, currentVersions);
    expect(out!.cursor).toBeUndefined();
  });
});
