import React, { useState, useCallback, useMemo, useDeferredValue, memo } from 'react';
import styles from './FileTree.module.css';
import {
  getExtension,
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

function sortNode(node: TreeNode): void {
  node.sortedChildren = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  node.sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  for (const [, child] of node.sortedChildren) {
    sortNode(child);
  }
}

export function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', children: new Map(), files: [], sortedChildren: [], sortedFiles: [] };

  for (const path of paths) {
    const parts = path.split('\\');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node.children.has(dir)) {
        node.children.set(dir, { name: dir, children: new Map(), files: [], sortedChildren: [], sortedFiles: [] });
      }
      node = node.children.get(dir)!;
    }
    node.files.push({ name: parts[parts.length - 1], fullPath: path, fullPathLower: path.toLowerCase() });
  }

  sortNode(root);
  return root;
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
  onSelectFile: (path: string) => void;
  getFileStatus?: (path: string) => string | undefined;
  renderFileBadge?: (path: string) => React.ReactNode;
  renderFolderBadge?: (node: TreeNode, folderPath: string) => React.ReactNode;
  fileIcon?: (name: string) => string;
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
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  visibleSet: Set<string> | null;
  visibleFolderPaths: Set<string> | null;
  renderFileBadge?: (path: string) => React.ReactNode;
  renderFolderBadge?: (node: TreeNode, folderPath: string) => React.ReactNode;
  fileIconFn: (name: string) => string;
  singleChild: boolean;
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
  selectedPath,
  onSelectFile,
  visibleSet,
  visibleFolderPaths,
  renderFileBadge,
  renderFolderBadge,
  fileIconFn,
  singleChild,
}: TreeFolderProps) {
  const isExpanded = autoExpand || singleChild || expandedPaths.has(folderPath);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(folderPath);
    },
    [folderPath, onToggleExpand],
  );

  const arrowClass = isExpanded ? `${styles.treeArrow} ${styles.expanded}` : styles.treeArrow;
  const folderIcon = isExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1';

  return (
    <div>
      <div
        className={styles.treeItem}
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
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            visibleSet={visibleSet}
            visibleFolderPaths={visibleFolderPaths}
            renderFileBadge={renderFileBadge}
            renderFolderBadge={renderFolderBadge}
            fileIconFn={fileIconFn}
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
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  visibleSet: Set<string> | null;
  visibleFolderPaths: Set<string> | null;
  renderFileBadge?: (path: string) => React.ReactNode;
  renderFolderBadge?: (node: TreeNode, folderPath: string) => React.ReactNode;
  fileIconFn: (name: string) => string;
}

function TreeNodeContents({
  node,
  depth,
  folderPath,
  filterLower,
  autoExpand,
  expandedPaths,
  onToggleExpand,
  selectedPath,
  onSelectFile,
  visibleSet,
  visibleFolderPaths,
  renderFileBadge,
  renderFolderBadge,
  fileIconFn,
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

  const singleChild = visibleFolders.length + visibleFiles.length === 1;

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
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            visibleSet={visibleSet}
            visibleFolderPaths={visibleFolderPaths}
            renderFileBadge={renderFileBadge}
            renderFolderBadge={renderFolderBadge}
            fileIconFn={fileIconFn}
            singleChild={singleChild}
          />
        );
      })}
      {visibleFiles.map((file) => (
        <FileRow
          key={file.fullPath}
          file={file}
          depth={depth}
          isSelected={file.fullPath === selectedPath}
          filterLower={filterLower}
          onSelect={onSelectFile}
          fileIconFn={fileIconFn}
          renderFileBadge={renderFileBadge}
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
  onSelect: (path: string) => void;
  fileIconFn: (name: string) => string;
  renderFileBadge?: (path: string) => React.ReactNode;
}

const FileRow = memo(function FileRow({
  file, depth, isSelected, filterLower, onSelect, fileIconFn, renderFileBadge,
}: FileRowProps) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(file.fullPath);
  }, [file.fullPath, onSelect]);

  const rowClass = isSelected ? `${styles.treeItem} ${styles.selected}` : styles.treeItem;

  return (
    <div
      className={rowClass}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      onClick={handleClick}
    >
      <span className={`${styles.treeArrow} ${styles.leaf}`} />
      <span className={styles.treeIcon}>{fileIconFn(file.name)}</span>
      <HighlightedLabel text={file.name} filterLower={filterLower} />
      {renderFileBadge?.(file.fullPath)}
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
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const fileIconFn = fileIcon ?? defaultFileIcon;

  // useDeferredValue: React equivalent of the original's renderGeneration.
  // Typing stays responsive; intermediate tree renders are skipped when
  // the user types faster than React can paint.
  const deferredFilter = useDeferredValue(filterText);
  const filterLower = useMemo(() => deferredFilter.toLowerCase(), [deferredFilter]);
  const autoExpand = filterLower.length > 0;

  // Pre-compute visible sets once per deferred filter change
  const { visibleSet, visibleFolderPaths } = useMemo(() => {
    if (!root || !filterLower) return { visibleSet: null, visibleFolderPaths: null };
    return computeVisibleSets(root, filterLower);
  }, [root, filterLower]);

  if (!root) return null;

  return (
    <TreeNodeContents
      node={root}
      depth={0}
      folderPath=""
      filterLower={filterLower}
      autoExpand={autoExpand}
      expandedPaths={expandedPaths}
      onToggleExpand={handleToggleExpand}
      selectedPath={selectedPath}
      onSelectFile={onSelectFile}
      visibleSet={visibleSet}
      visibleFolderPaths={visibleFolderPaths}
      renderFileBadge={renderFileBadge}
      renderFolderBadge={renderFolderBadge}
      fileIconFn={fileIconFn}
    />
  );
}
