import React, { useState, useCallback, useMemo, useDeferredValue, useEffect, useRef, memo } from 'react';
import { useStateSyncedWith } from '@shared/hooks/useStateSyncedWith';
import styles from './FileTree.module.css';
import {
  getExtension,
  normalizeFilter,
  IMAGE_EXTENSIONS,
  CANVAS_IMAGE_EXTENSIONS,
  TEXT_EXTENSIONS,
  MODEL_EXTENSIONS,
} from '@shared/util/files';

// --- Types ---

export interface TreeFile {
  name: string;
  fullPath: string;
  fullPathLower: string; // pre-cached for filtering
}

export interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  files: TreeFile[];
  /** Pre-sorted children entries (computed once in buildTree) */
  sortedChildren: [string, TreeNode][];
  /** Pre-sorted files (computed once in buildTree) */
  sortedFiles: TreeFile[];
}

// --- buildTree ---

/** Construct an empty `TreeNode`. Shared so all tree producers agree on shape. */
export function emptyTreeNode(name: string = ''): TreeNode {
  return { name, children: new Map(), files: [], sortedChildren: [], sortedFiles: [] };
}

/**
 * Populate `sortedChildren` and `sortedFiles` on every node, recursively.
 * The optional `fileCompare` lets callers add a tiebreaker (e.g. `pkgIndex`
 * for merged trees with duplicate entries).
 */
export function sortTree(
  node: TreeNode,
  fileCompare: (a: TreeFile, b: TreeFile) => number = (a, b) => a.name.localeCompare(b.name),
): void {
  node.sortedChildren = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  node.sortedFiles = [...node.files].sort(fileCompare);
  for (const [, child] of node.sortedChildren) {
    sortTree(child, fileCompare);
  }
}

export function buildTree(paths: string[]): TreeNode {
  const root = emptyTreeNode();

  for (const path of paths) {
    const parts = path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node.children.has(dir)) {
        node.children.set(dir, emptyTreeNode(dir));
      }
      node = node.children.get(dir)!;
    }
    node.files.push({ name: parts[parts.length - 1], fullPath: path, fullPathLower: path.toLowerCase() });
  }

  sortTree(root);
  return root;
}

/**
 * Walk the tree and return the paths of every folder whose parent has exactly
 * one child entry (folder or file). These are the folders we want to auto-
 * expand so single-child chains feel continuous.
 *
 * When `suppressRoot` is set, skip the root-level child. Callers use this
 * when more than one top-level package is expected but only one has arrived
 * so far — otherwise that single package would visually "open itself" while
 * peer packages still loading stay collapsed, producing an inconsistent tree.
 */
export function collectSingleChildPaths(
  root: TreeNode,
  opts: { suppressRoot?: boolean } = {},
): string[] {
  const out: string[] = [];
  function walk(node: TreeNode, path: string) {
    const isRoot = path === '';
    const skip = isRoot && opts.suppressRoot;
    if (!skip && node.files.length === 0 && node.children.size === 1) {
      const [[childName]] = node.children;
      const childPath = path ? `${path}\\${childName}` : childName;
      out.push(childPath);
    }
    for (const [name, child] of node.children) {
      const childPath = path ? `${path}\\${name}` : name;
      walk(child, childPath);
    }
  }
  walk(root, '');
  return out;
}

/**
 * Walk up the DOM looking for the nearest ancestor with a real vertical
 * scroll (`overflow-y: auto | scroll` AND content that exceeds its box).
 * Used to check whether a row is already in view before centering it.
 */
function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let parent: HTMLElement | null = el.parentElement;
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

// --- Default file icon ---

function defaultFileIcon(name: string): string {
  const ext = getExtension(name);
  if (IMAGE_EXTENSIONS.has(ext) || CANVAS_IMAGE_EXTENSIONS.has(ext)) return '\uD83D\uDDBC\uFE0F';
  if (MODEL_EXTENSIONS.has(ext)) return '\u25C7';
  if (TEXT_EXTENSIONS.has(ext)) return '\uD83D\uDCC4';
  return '\uD83D\uDCCE';
}

// --- Visibility pre-computation ---

function computeVisibleSets(node: TreeNode, filterLower: string): { visibleSet: Set<string>; visibleFolderPaths: Set<string> } {
  const visibleSet = new Set<string>();
  const visibleFolderPaths = new Set<string>();
  collectMatchingWithFolders(node, filterLower, '', visibleSet, visibleFolderPaths);
  return { visibleSet, visibleFolderPaths };
}

/** Returns true if this node or any descendant has a visible file. */
function collectMatchingWithFolders(
  node: TreeNode,
  filterLower: string,
  currentPath: string,
  visibleSet: Set<string>,
  visibleFolderPaths: Set<string>,
): boolean {
  let hasVisible = false;
  for (const file of node.files) {
    if (file.fullPathLower.includes(filterLower)) {
      visibleSet.add(file.fullPath);
      hasVisible = true;
    }
  }
  for (const [name, child] of node.children) {
    const childPath = currentPath ? `${currentPath}\\${name}` : name;
    const childVisible = collectMatchingWithFolders(child, filterLower, childPath, visibleSet, visibleFolderPaths);
    if (childVisible) {
      visibleFolderPaths.add(childPath);
      hasVisible = true;
    }
  }
  return hasVisible;
}

// --- Label highlight ---

export const HighlightedLabel = memo(function HighlightedLabel({ text, filterLower }: { text: string; filterLower: string }) {
  if (!filterLower) {
    return <span className={styles.treeLabel}>{text}</span>;
  }
  const lower = text.toLowerCase();
  const idx = lower.indexOf(filterLower);
  if (idx === -1) {
    return <span className={styles.treeLabel}>{text}</span>;
  }
  return (
    <span className={styles.treeLabel}>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + filterLower.length)}</mark>
      {text.slice(idx + filterLower.length)}
    </span>
  );
});

// --- Component props ---

interface FileTreeProps {
  root: TreeNode | null;
  selectedPath: string | null;
  filterText: string;
  onSelectFile: (file: TreeFile) => void;
  getFileStatus?: (path: string) => string | undefined;
  renderFileBadge?: (file: TreeFile) => React.ReactNode;
  renderFolderBadge?: (node: TreeNode, folderPath: string) => React.ReactNode;
  fileIcon?: (name: string) => string;
  /** Per-file row style. Callers should pass a referentially-stable function (wrap in useCallback) so FileRow memoization holds. */
  fileRowStyle?: (file: TreeFile) => React.CSSProperties | undefined;
  /**
   * Skip the single-child auto-expansion at the root level. Useful when more
   * than one top-level subtree is expected (e.g. multiple packages loading)
   * so an early arrival doesn't auto-open while peers stay collapsed.
   */
  suppressRootAutoExpand?: boolean;
}

// --- TreeFolder ---

interface TreeFolderProps {
  name: string;
  node: TreeNode;
  depth: number;
  folderPath: string;
  filterLower: string;
  autoExpand: boolean;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  focusedPath: string | null;
  onFocusPath: (path: string) => void;
  onSelectFile: (file: TreeFile) => void;
  visibleSet: Set<string> | null;
  visibleFolderPaths: Set<string> | null;
  renderFileBadge?: (file: TreeFile) => React.ReactNode;
  renderFolderBadge?: (node: TreeNode, folderPath: string) => React.ReactNode;
  fileIconFn: (name: string) => string;
  fileRowStyle?: (file: TreeFile) => React.CSSProperties | undefined;
}

const TreeFolder = memo(function TreeFolder({
  name,
  node,
  depth,
  folderPath,
  filterLower,
  autoExpand,
  expandedPaths,
  onToggleExpand,
  focusedPath,
  onFocusPath,
  onSelectFile,
  visibleSet,
  visibleFolderPaths,
  renderFileBadge,
  renderFolderBadge,
  fileIconFn,
  fileRowStyle,
}: TreeFolderProps) {
  const isExpanded = autoExpand || expandedPaths.has(folderPath);
  const isFocused = folderPath === focusedPath;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFocusPath(folderPath);
      onToggleExpand(folderPath);
    },
    [folderPath, onFocusPath, onToggleExpand],
  );

  const arrowClass = isExpanded ? `${styles.treeArrow} ${styles.expanded}` : styles.treeArrow;
  const folderIcon = isExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1';
  const rowClass = isFocused ? `${styles.treeItem} ${styles.selected}` : styles.treeItem;

  return (
    <div>
      <div
        className={rowClass}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
      >
        <span className={arrowClass}>{'\u25B6'}</span>
        <span className={styles.treeIcon}>{folderIcon}</span>
        <HighlightedLabel text={name} filterLower={filterLower} />
        {renderFolderBadge?.(node, folderPath)}
      </div>
      <div className={isExpanded ? `${styles.treeChildren} ${styles.expanded}` : styles.treeChildren}>
        {isExpanded && (
          <TreeNodeContents
            node={node}
            depth={depth + 1}
            folderPath={folderPath}
            filterLower={filterLower}
            autoExpand={autoExpand}
            expandedPaths={expandedPaths}
            onToggleExpand={onToggleExpand}
            focusedPath={focusedPath}
            onFocusPath={onFocusPath}
            onSelectFile={onSelectFile}
            visibleSet={visibleSet}
            visibleFolderPaths={visibleFolderPaths}
            renderFileBadge={renderFileBadge}
            renderFolderBadge={renderFolderBadge}
            fileIconFn={fileIconFn}
            fileRowStyle={fileRowStyle}
          />
        )}
      </div>
    </div>
  );
});

// --- TreeNodeContents ---

interface TreeNodeContentsProps {
  node: TreeNode;
  depth: number;
  folderPath: string;
  filterLower: string;
  autoExpand: boolean;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  focusedPath: string | null;
  onFocusPath: (path: string) => void;
  onSelectFile: (file: TreeFile) => void;
  visibleSet: Set<string> | null;
  visibleFolderPaths: Set<string> | null;
  renderFileBadge?: (file: TreeFile) => React.ReactNode;
  renderFolderBadge?: (node: TreeNode, folderPath: string) => React.ReactNode;
  fileIconFn: (name: string) => string;
  fileRowStyle?: (file: TreeFile) => React.CSSProperties | undefined;
}

function TreeNodeContents({
  node,
  depth,
  folderPath,
  filterLower,
  autoExpand,
  expandedPaths,
  onToggleExpand,
  focusedPath,
  onFocusPath,
  onSelectFile,
  visibleSet,
  visibleFolderPaths,
  renderFileBadge,
  renderFolderBadge,
  fileIconFn,
  fileRowStyle,
}: TreeNodeContentsProps) {
  const visibleFolders = visibleFolderPaths
    ? node.sortedChildren.filter(([name]) => {
        const childPath = folderPath ? `${folderPath}\\${name}` : name;
        return visibleFolderPaths.has(childPath);
      })
    : node.sortedChildren;

  const visibleFiles = visibleSet
    ? node.sortedFiles.filter((f) => visibleSet.has(f.fullPath))
    : node.sortedFiles;

  return (
    <>
      {visibleFolders.map(([name, child]) => {
        const childPath = folderPath ? `${folderPath}\\${name}` : name;
        return (
          <TreeFolder
            key={childPath}
            name={name}
            node={child}
            depth={depth}
            folderPath={childPath}
            filterLower={filterLower}
            autoExpand={autoExpand}
            expandedPaths={expandedPaths}
            onToggleExpand={onToggleExpand}
            focusedPath={focusedPath}
            onFocusPath={onFocusPath}
            onSelectFile={onSelectFile}
            visibleSet={visibleSet}
            visibleFolderPaths={visibleFolderPaths}
            renderFileBadge={renderFileBadge}
            renderFolderBadge={renderFolderBadge}
            fileIconFn={fileIconFn}
            fileRowStyle={fileRowStyle}
          />
        );
      })}
      {visibleFiles.map((file) => (
        <FileRow
          key={file.fullPath}
          file={file}
          depth={depth}
          isSelected={file.fullPath === focusedPath}
          filterLower={filterLower}
          onSelect={onSelectFile}
          onFocusPath={onFocusPath}
          fileIconFn={fileIconFn}
          renderFileBadge={renderFileBadge}
          fileRowStyle={fileRowStyle}
        />
      ))}
    </>
  );
}

// --- FileRow (memoized) ---

interface FileRowProps {
  file: TreeFile;
  depth: number;
  isSelected: boolean;
  filterLower: string;
  onSelect: (file: TreeFile) => void;
  onFocusPath: (path: string) => void;
  fileIconFn: (name: string) => string;
  renderFileBadge?: (file: TreeFile) => React.ReactNode;
  fileRowStyle?: (file: TreeFile) => React.CSSProperties | undefined;
}

const FileRow = memo(function FileRow({
  file, depth, isSelected, filterLower, onSelect, onFocusPath, fileIconFn, renderFileBadge, fileRowStyle,
}: FileRowProps) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFocusPath(file.fullPath);
    onSelect(file);
  }, [file, onFocusPath, onSelect]);

  const rowClass = isSelected ? `${styles.treeItem} ${styles.selected}` : styles.treeItem;
  const rowStyle = fileRowStyle?.(file);

  return (
    <div
      className={rowClass}
      style={{ paddingLeft: `${8 + depth * 16}px`, ...rowStyle }}
      onClick={handleClick}
      data-file-path={file.fullPath}
    >
      <span className={`${styles.treeArrow} ${styles.leaf}`} />
      <span className={styles.treeIcon}>{fileIconFn(file.name)}</span>
      <HighlightedLabel text={file.name} filterLower={filterLower} />
      {renderFileBadge?.(file)}
    </div>
  );
});

// --- FileTree ---

export function FileTree({
  root,
  selectedPath,
  filterText,
  onSelectFile,
  renderFileBadge,
  renderFolderBadge,
  fileIcon,
  fileRowStyle,
  suppressRootAutoExpand,
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() =>
    root ? new Set(collectSingleChildPaths(root, { suppressRoot: suppressRootAutoExpand })) : new Set(),
  );
  const [lastRoot, setLastRoot] = useState<TreeNode | null>(root);

  // Focused row (file OR folder) — diverges from selectedPath when a folder
  // is clicked, so the preview panel stays put while the highlight moves.
  const [focusedPath, setFocusedPath] = useStateSyncedWith(selectedPath);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Auto-expand single-child chains synchronously when `root` changes, using
  // the derived-state-during-render pattern. Merging (rather than replacing)
  // preserves user toggles: a folder the user collapsed stays collapsed
  // across root changes (we only add paths here, never remove). Folders
  // that were single-child before a merge stay expanded even when the root
  // gains new siblings. Running synchronously during render (vs. via effect)
  // avoids a one-frame gap where the tree is fully collapsed.
  if (root !== lastRoot) {
    setLastRoot(root);
    if (root) {
      const auto = collectSingleChildPaths(root, { suppressRoot: suppressRootAutoExpand });
      if (auto.length > 0) {
        setExpandedPaths((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const p of auto) {
            if (!next.has(p)) {
              next.add(p);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    }
  }

  const fileIconFn = fileIcon ?? defaultFileIcon;

  // useDeferredValue: React equivalent of the original's renderGeneration.
  // Typing stays responsive; intermediate tree renders are skipped when
  // the user types faster than React can paint.
  const deferredFilter = useDeferredValue(filterText);
  const filterLower = useMemo(() => normalizeFilter(deferredFilter), [deferredFilter]);
  const autoExpand = filterLower.length > 0;

  // Pre-compute visible sets once per deferred filter change
  const { visibleSet, visibleFolderPaths } = useMemo(() => {
    if (!root || !filterLower) return { visibleSet: null, visibleFolderPaths: null };
    return computeVisibleSets(root, filterLower);
  }, [root, filterLower]);

  const containerRef = useRef<HTMLDivElement>(null);
  // Tracks which `selectedPath` we last performed a scroll for, so the
  // reveal-scroll effect fires exactly once per selection — not every time
  // `expandedPaths` changes (e.g. the user manually toggles a folder
  // unrelated to the selection).
  const lastScrolledPathRef = useRef<string | null>(null);

  // Compute the ancestor folder paths of the current selection. Shared by
  // the expand effect and the scroll effect's "are we ready yet?" guard.
  const selectionAncestors = useMemo<string[]>(() => {
    if (!selectedPath) return [];
    const out: string[] = [];
    let idx = selectedPath.indexOf('/');
    while (idx >= 0) {
      out.push(selectedPath.slice(0, idx));
      idx = selectedPath.indexOf('/', idx + 1);
    }
    return out;
  }, [selectedPath]);

  // Reveal the selection in two steps so DOM commits interleave correctly:
  //   1. Expand every ancestor so the row mounts in the tree.
  //   2. Once `expandedPaths` reflects that, schedule a rAF + scroll-center.
  // Doing both in one effect would race: `setExpandedPaths` schedules a
  // re-render, but `requestAnimationFrame` fires before React commits it,
  // so `querySelector` runs against the pre-expansion DOM and silently
  // misses the row.
  useEffect(() => {
    if (selectionAncestors.length === 0) return;
    setExpandedPaths((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const p of selectionAncestors) {
        if (!next.has(p)) {
          next.add(p);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectionAncestors]);

  useEffect(() => {
    if (!selectedPath) {
      lastScrolledPathRef.current = null;
      return;
    }
    // Bail out before scheduling rAF: unrelated `expandedPaths` churn (user
    // toggling folders) re-fires this effect, and we don't want to allocate
    // a closure + rAF slot just to find out we've already scrolled.
    if (lastScrolledPathRef.current === selectedPath) return;
    const ancestorsReady =
      autoExpand || selectionAncestors.every((p) => expandedPaths.has(p));
    if (!ancestorsReady) return;

    const raf = requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(
        `[data-file-path="${CSS.escape(selectedPath)}"]`,
      );
      if (!el) return;
      lastScrolledPathRef.current = selectedPath;
      const scrollable = findScrollableAncestor(el);
      if (!scrollable) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const rowRect = el.getBoundingClientRect();
      const boxRect = scrollable.getBoundingClientRect();
      // One row of breathing room above/below: the first or last fully
      // visible entry still triggers a re-center since those positions give
      // no surrounding context.
      const margin = rowRect.height;
      const hasBreathingRoom =
        rowRect.top >= boxRect.top + margin && rowRect.bottom <= boxRect.bottom - margin;
      if (!hasBreathingRoom) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedPath, expandedPaths, selectionAncestors, autoExpand]);

  if (!root) return null;

  return (
    <div ref={containerRef}>
      <TreeNodeContents
        node={root}
        depth={0}
        folderPath=""
        filterLower={filterLower}
        autoExpand={autoExpand}
        expandedPaths={expandedPaths}
        onToggleExpand={handleToggleExpand}
        focusedPath={focusedPath}
        onFocusPath={setFocusedPath}
        onSelectFile={onSelectFile}
        visibleSet={visibleSet}
        visibleFolderPaths={visibleFolderPaths}
        renderFileBadge={renderFileBadge}
        renderFolderBadge={renderFolderBadge}
        fileIconFn={fileIconFn}
        fileRowStyle={fileRowStyle}
      />
    </div>
  );
}
