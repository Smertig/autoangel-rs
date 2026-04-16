import { emptyTreeNode, sortTree, type TreeNode, type TreeFile } from '@shared/components/FileTree';

/**
 * A tree leaf tagged with the owning package index. `duplicate` is true iff
 * another package contributes a file at the same `fullPath`. Structurally
 * satisfies `TreeFile` so the merged tree reuses `TreeNode`.
 */
export interface TaggedTreeFile extends TreeFile {
  pkgIndex: number;
  duplicate: boolean;
}

/**
 * Merge per-package `TreeNode`s into a single tagged tree. Folder structure
 * is the union of all inputs. Files at the same `fullPath` in multiple
 * packages become sibling entries under the shared folder, each flagged
 * `duplicate = true`. Files at unique paths stay `duplicate = false`.
 */
export function mergePackageTrees(
  perPackage: Array<{ tree: TreeNode; pkgIndex: number }>,
): TreeNode {
  const root = emptyTreeNode();
  if (perPackage.length === 0) return root;

  mergeInto(
    root,
    perPackage.map(({ tree, pkgIndex }) => ({ node: tree, pkgIndex })),
  );
  sortTree(root, (a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return (a as TaggedTreeFile).pkgIndex - (b as TaggedTreeFile).pkgIndex;
  });
  return root;
}

/**
 * Recursively merge a set of source nodes (one per package) into `dest`.
 * All source nodes represent the same folder position in their respective
 * trees; their files/children are unioned into `dest`.
 */
function mergeInto(dest: TreeNode, sources: Array<{ node: TreeNode; pkgIndex: number }>): void {
  // --- Merge files: group by fullPath to detect duplicates. ---
  const byPath = new Map<string, TaggedTreeFile[]>();
  for (const { node, pkgIndex } of sources) {
    for (const f of node.files) {
      const tagged: TaggedTreeFile = {
        name: f.name,
        fullPath: f.fullPath,
        fullPathLower: f.fullPathLower,
        pkgIndex,
        duplicate: false,
      };
      const bucket = byPath.get(f.fullPath);
      if (bucket) bucket.push(tagged);
      else byPath.set(f.fullPath, [tagged]);
    }
  }
  for (const bucket of byPath.values()) {
    const isDup = bucket.length > 1;
    for (const t of bucket) {
      t.duplicate = isDup;
      dest.files.push(t);
    }
  }

  // --- Merge children: group source child nodes by folder name. ---
  const childGroups = new Map<string, Array<{ node: TreeNode; pkgIndex: number }>>();
  for (const { node, pkgIndex } of sources) {
    for (const [name, child] of node.children) {
      const group = childGroups.get(name);
      if (group) group.push({ node: child, pkgIndex });
      else childGroups.set(name, [{ node: child, pkgIndex }]);
    }
  }
  for (const [name, group] of childGroups) {
    const destChild = emptyTreeNode(name);
    mergeInto(destChild, group);
    dest.children.set(name, destChild);
  }
}
