import { describe, it, expect } from 'vitest';
import { buildTree, type TreeNode, type TreeFile } from '@shared/components/FileTree';
import { mergePackageTrees, type TaggedTreeFile } from '../merge-tree';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asTagged(file: TreeFile): TaggedTreeFile {
  return file as TaggedTreeFile;
}

function collectFilePaths(node: TreeNode): string[] {
  const paths: string[] = [];
  function walk(n: TreeNode) {
    for (const f of n.files) paths.push(f.fullPath);
    for (const [, c] of n.children) walk(c);
  }
  walk(node);
  return paths;
}

function findChild(node: TreeNode, name: string): TreeNode {
  const c = node.children.get(name);
  if (!c) throw new Error(`missing child: ${name}`);
  return c;
}

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe('mergePackageTrees — empty input', () => {
  it('returns an empty root node', () => {
    const merged = mergePackageTrees([]);
    expect(merged.name).toBe('');
    expect(merged.children.size).toBe(0);
    expect(merged.files).toHaveLength(0);
    expect(merged.sortedChildren).toHaveLength(0);
    expect(merged.sortedFiles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Single package
// ---------------------------------------------------------------------------

describe('mergePackageTrees — single package', () => {
  it('preserves folder structure and tags files with provided pkgIndex', () => {
    const tree = buildTree(['gfx\\ui\\icon.dds', 'gfx\\ui\\btn.dds', 'readme.txt']);
    const merged = mergePackageTrees([{ tree, pkgIndex: 2 }]);

    // Same top-level shape: children 'gfx', file 'readme.txt'.
    expect([...merged.children.keys()].sort()).toEqual(['gfx']);
    expect(merged.files.map((f) => f.fullPath)).toEqual(['readme.txt']);

    const readme = asTagged(merged.files[0]);
    expect(readme.pkgIndex).toBe(2);
    expect(readme.duplicate).toBe(false);

    // Nested folder preserved.
    const ui = findChild(findChild(merged, 'gfx'), 'ui');
    expect(ui.files.map((f) => f.fullPath).sort()).toEqual(['gfx\\ui\\btn.dds', 'gfx\\ui\\icon.dds']);

    for (const f of ui.files) {
      const t = asTagged(f);
      expect(t.pkgIndex).toBe(2);
      expect(t.duplicate).toBe(false);
    }

    // sortedFiles must be alphabetical by name.
    expect(ui.sortedFiles.map((f) => f.name)).toEqual(['btn.dds', 'icon.dds']);
  });
});

// ---------------------------------------------------------------------------
// Disjoint roots
// ---------------------------------------------------------------------------

describe('mergePackageTrees — disjoint roots', () => {
  it('unions root folders, tagging files correctly', () => {
    const t0 = buildTree(['gfx\\ui\\icon.dds']);
    const t1 = buildTree(['models\\m01.ski']);
    const merged = mergePackageTrees([
      { tree: t0, pkgIndex: 0 },
      { tree: t1, pkgIndex: 1 },
    ]);

    expect([...merged.children.keys()].sort()).toEqual(['gfx', 'models']);

    const icon = asTagged(findChild(findChild(merged, 'gfx'), 'ui').files[0]);
    expect(icon.fullPath).toBe('gfx\\ui\\icon.dds');
    expect(icon.pkgIndex).toBe(0);
    expect(icon.duplicate).toBe(false);

    const m01 = asTagged(findChild(merged, 'models').files[0]);
    expect(m01.fullPath).toBe('models\\m01.ski');
    expect(m01.pkgIndex).toBe(1);
    expect(m01.duplicate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Overlapping folders, distinct files
// ---------------------------------------------------------------------------

describe('mergePackageTrees — overlapping folders, distinct files', () => {
  it('merges siblings under a shared folder without marking duplicates', () => {
    const t0 = buildTree(['data\\a.txt']);
    const t1 = buildTree(['data\\b.txt']);
    const merged = mergePackageTrees([
      { tree: t0, pkgIndex: 0 },
      { tree: t1, pkgIndex: 1 },
    ]);

    // Only one 'data' folder.
    expect([...merged.children.keys()]).toEqual(['data']);
    const data = findChild(merged, 'data');

    // Two files, both non-duplicate, each tagged with its pkg.
    expect(data.files).toHaveLength(2);
    const byPath = new Map(data.files.map((f) => [f.fullPath, asTagged(f)]));
    expect(byPath.get('data\\a.txt')!.pkgIndex).toBe(0);
    expect(byPath.get('data\\a.txt')!.duplicate).toBe(false);
    expect(byPath.get('data\\b.txt')!.pkgIndex).toBe(1);
    expect(byPath.get('data\\b.txt')!.duplicate).toBe(false);

    // sortedFiles alphabetical.
    expect(data.sortedFiles.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
  });
});

// ---------------------------------------------------------------------------
// Duplicate full paths
// ---------------------------------------------------------------------------

describe('mergePackageTrees — duplicate full paths', () => {
  it('keeps both entries as siblings, tagged duplicate=true, ordered by pkgIndex', () => {
    const t0 = buildTree(['gfx\\icon.dds']);
    const t1 = buildTree(['gfx\\icon.dds']);
    const merged = mergePackageTrees([
      { tree: t0, pkgIndex: 3 },
      { tree: t1, pkgIndex: 1 },
    ]);

    const gfx = findChild(merged, 'gfx');
    expect(gfx.files).toHaveLength(2);

    const tagged = gfx.sortedFiles.map(asTagged);
    // Same name → tiebreaker is pkgIndex ascending: 1 before 3.
    expect(tagged.map((f) => f.pkgIndex)).toEqual([1, 3]);
    for (const f of tagged) {
      expect(f.fullPath).toBe('gfx\\icon.dds');
      expect(f.name).toBe('icon.dds');
      expect(f.duplicate).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Three packages, one duplicate pair among them
// ---------------------------------------------------------------------------

describe('mergePackageTrees — three packages, partial duplication', () => {
  it('marks only the colliding pair as duplicate', () => {
    const shared = 'gfx\\shared.dds';
    const t0 = buildTree([shared, 'gfx\\only0.dds']);
    const t1 = buildTree(['models\\only1.ski']);
    const t2 = buildTree([shared]);
    const merged = mergePackageTrees([
      { tree: t0, pkgIndex: 0 },
      { tree: t1, pkgIndex: 1 },
      { tree: t2, pkgIndex: 2 },
    ]);

    const gfx = findChild(merged, 'gfx');
    // 'shared.dds' twice + 'only0.dds' once = 3 files.
    expect(gfx.files).toHaveLength(3);

    const sharedFiles = gfx.files.filter((f) => f.fullPath === shared).map(asTagged);
    expect(sharedFiles).toHaveLength(2);
    expect(sharedFiles.every((f) => f.duplicate)).toBe(true);
    expect(sharedFiles.map((f) => f.pkgIndex).sort()).toEqual([0, 2]);

    const only0 = gfx.files.find((f) => f.fullPath === 'gfx\\only0.dds')!;
    expect(asTagged(only0).pkgIndex).toBe(0);
    expect(asTagged(only0).duplicate).toBe(false);

    const only1 = asTagged(findChild(merged, 'models').files[0]);
    expect(only1.pkgIndex).toBe(1);
    expect(only1.duplicate).toBe(false);

    // All files accounted for.
    expect(collectFilePaths(merged).sort()).toEqual(
      ['gfx\\only0.dds', 'gfx\\shared.dds', 'gfx\\shared.dds', 'models\\only1.ski'].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Sort determinism
// ---------------------------------------------------------------------------

describe('mergePackageTrees — sort determinism', () => {
  it('sortedChildren is alphabetical', () => {
    const t0 = buildTree(['zeta\\z.txt']);
    const t1 = buildTree(['alpha\\a.txt']);
    const t2 = buildTree(['mu\\m.txt']);
    const merged = mergePackageTrees([
      { tree: t0, pkgIndex: 0 },
      { tree: t1, pkgIndex: 1 },
      { tree: t2, pkgIndex: 2 },
    ]);
    expect(merged.sortedChildren.map(([n]) => n)).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('sortedFiles ties break on pkgIndex ascending', () => {
    // Three packages colliding on the same full path, provided out of order.
    const path = 'a\\x.txt';
    const t0 = buildTree([path]);
    const t1 = buildTree([path]);
    const t2 = buildTree([path]);
    const merged = mergePackageTrees([
      { tree: t0, pkgIndex: 5 },
      { tree: t1, pkgIndex: 2 },
      { tree: t2, pkgIndex: 4 },
    ]);
    const a = findChild(merged, 'a');
    expect(a.sortedFiles.map((f) => asTagged(f).pkgIndex)).toEqual([2, 4, 5]);
  });

  it('sortedFiles primary key is localeCompare on name', () => {
    const t0 = buildTree(['d\\b.txt']);
    const t1 = buildTree(['d\\a.txt']);
    const merged = mergePackageTrees([
      { tree: t0, pkgIndex: 0 },
      { tree: t1, pkgIndex: 1 },
    ]);
    const d = findChild(merged, 'd');
    expect(d.sortedFiles.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
  });
});
