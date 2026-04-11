import React, { useState, useCallback } from 'react';
import { DiffStatus, DiffStatusValue } from '../types';
import { HighlightedLabel } from '@shared/components/FileTree';
import styles from '../App.module.css';
import sharedStyles from '@shared/components/FileTree.module.css';

// --- Constants ---

export const STATUS_LETTER: Record<DiffStatusValue, string> = {
  added: 'A',
  deleted: 'D',
  modified: 'M',
  unchanged: '',
  pending: '\u2026',
};

export const STATUS_PREFIX: Record<DiffStatusValue, string> = {
  added: '+',
  deleted: '\u2212',
  modified: '~',
  unchanged: '',
  pending: '',
};

// --- Tree node types ---

export interface DiffTreeFile {
  name: string;
  fullPath: string;
  status: DiffStatusValue;
}

export interface DiffTreeNode {
  name: string;
  children: Map<string, DiffTreeNode>;
  files: DiffTreeFile[];
  /** Pre-sorted children entries (computed once in buildDiffTree) */
  sortedChildren: [string, DiffTreeNode][];
  /** Pre-sorted files (computed once in buildDiffTree) */
  sortedFiles: DiffTreeFile[];
}

// --- Build diff tree from fileStatus ---

function sortDiffNode(node: DiffTreeNode): void {
  node.sortedChildren = [...node.children.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true }),
  );
  node.sortedFiles = [...node.files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  for (const [, child] of node.sortedChildren) {
    sortDiffNode(child);
  }
}

export function buildDiffTree(fileStatus: Map<string, DiffStatusValue>): DiffTreeNode {
  const root: DiffTreeNode = { name: '', children: new Map(), files: [], sortedChildren: [], sortedFiles: [] };

  for (const [path, status] of fileStatus) {
    const parts = path.split('\\');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node.children.has(dir)) {
        node.children.set(dir, { name: dir, children: new Map(), files: [], sortedChildren: [], sortedFiles: [] });
      }
      node = node.children.get(dir)!;
    }
    node.files.push({
      name: parts[parts.length - 1],
      fullPath: path,
      status,
    });
  }

  sortDiffNode(root);
  return root;
}

// --- Folder status computation ---

interface FolderStatus {
  status: DiffStatusValue;
  hasPending: boolean;
}

function computeFolderStatus(
  node: DiffTreeNode,
  getFileStatus: (path: string) => DiffStatusValue | undefined,
  isFileVisible: (file: DiffTreeFile) => boolean,
): FolderStatus | null {
  const found = new Set<DiffStatusValue>();
  let hasPending = false;

  for (const file of node.files) {
    if (!isFileVisible(file)) continue;
    const liveStatus = getFileStatus(file.fullPath) ?? file.status;
    if (liveStatus === DiffStatus.PENDING) hasPending = true;
    found.add(liveStatus);
  }

  for (const [, child] of node.children) {
    const childResult = computeFolderStatus(child, getFileStatus, isFileVisible);
    if (childResult !== null) {
      found.add(childResult.status);
      if (childResult.hasPending) hasPending = true;
    }
  }

  if (found.size === 0) return null;

  const resolved = new Set(found);
  resolved.delete(DiffStatus.PENDING);
  resolved.delete(DiffStatus.UNCHANGED);

  let status: DiffStatusValue;
  if (resolved.size === 0) {
    status = found.has(DiffStatus.PENDING) ? DiffStatus.PENDING : DiffStatus.UNCHANGED;
  } else if (resolved.size === 1) {
    status = [...resolved][0];
  } else {
    status = DiffStatus.MODIFIED;
  }

  return { status, hasPending };
}

// --- File row ---

function DiffFileRow({
  file,
  depth,
  filterLower,
  isSelected,
  getFileStatus,
  onSelect,
}: {
  file: DiffTreeFile;
  depth: number;
  filterLower: string;
  isSelected: boolean;
  getFileStatus: (path: string) => DiffStatusValue | undefined;
  onSelect: (path: string) => void;
}) {
  const liveStatus = getFileStatus(file.fullPath) ?? file.status;

  const rowClass = [
    sharedStyles.treeItem,
    styles[`treeItem_${liveStatus}`] ?? '',
    isSelected ? sharedStyles.selected : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={rowClass}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      data-path={file.fullPath}
      data-status={liveStatus}
      onClick={(e) => { e.stopPropagation(); onSelect(file.fullPath); }}
    >
      <span className={`${sharedStyles.treeArrow} ${sharedStyles.leaf}`} />
      <span className={sharedStyles.treeIcon}>{'\uD83D\uDCC4'}</span>
      <HighlightedLabel text={file.name} filterLower={filterLower} />
      {liveStatus === DiffStatus.PENDING ? (
        <span className={styles.scanDot} />
      ) : liveStatus !== DiffStatus.UNCHANGED ? (
        <span className={`${styles.diffBadge} ${styles[`diffBadge_${liveStatus}`] ?? ''}`}>
          {STATUS_LETTER[liveStatus]}
        </span>
      ) : null}
    </div>
  );
}

// --- Folder row ---

function DiffFolderNode({
  name,
  node,
  depth,
  folderPath,
  folderStatus,
  filterLower,
  autoExpand,
  expandedPaths,
  onToggleExpand,
  selectedPath,
  getFileStatus,
  isFileVisible,
  onSelectFile,
  singleChild,
}: {
  name: string;
  node: DiffTreeNode;
  depth: number;
  folderPath: string;
  folderStatus: FolderStatus;
  filterLower: string;
  autoExpand: boolean;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  selectedPath: string | null;
  getFileStatus: (path: string) => DiffStatusValue | undefined;
  isFileVisible: (file: DiffTreeFile) => boolean;
  onSelectFile: (path: string) => void;
  singleChild: boolean;
}) {

  const isExpanded = autoExpand || singleChild || expandedPaths.has(folderPath);
  const { status: fStatus, hasPending: fPending } = folderStatus;

  const arrowClass = [sharedStyles.treeArrow, isExpanded ? sharedStyles.expanded : ''].filter(Boolean).join(' ');
  const folderIcon = isExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1';

  const rowClass = [
    sharedStyles.treeItem,
    fStatus === DiffStatus.UNCHANGED ? styles[`treeItem_${DiffStatus.UNCHANGED}`] : '',
  ].filter(Boolean).join(' ');

  return (
    <div>
      <div
        className={rowClass}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={(e) => { e.stopPropagation(); onToggleExpand(folderPath); }}
      >
        <span className={arrowClass}>{'\u25B6'}</span>
        <span className={sharedStyles.treeIcon}>{folderIcon}</span>
        <HighlightedLabel text={name} filterLower={filterLower} />
        {fPending && <span className={styles.scanDot} />}
        {fStatus !== DiffStatus.UNCHANGED && fStatus !== DiffStatus.PENDING && (
          <span className={`${styles.diffBadge} ${styles[`diffBadge_${fStatus}`] ?? ''}`}>
            {STATUS_LETTER[fStatus]}
          </span>
        )}
      </div>
      <div className={[sharedStyles.treeChildren, isExpanded ? sharedStyles.expanded : ''].filter(Boolean).join(' ')}>
        {isExpanded && (
          <DiffNodeContents
            node={node}
            depth={depth + 1}
            folderPath={folderPath}
            filterLower={filterLower}
            autoExpand={autoExpand}
            expandedPaths={expandedPaths}
            onToggleExpand={onToggleExpand}
            selectedPath={selectedPath}
            getFileStatus={getFileStatus}
            isFileVisible={isFileVisible}
            onSelectFile={onSelectFile}
          />
        )}
      </div>
    </div>
  );
}

// --- Node contents ---

function DiffNodeContents({
  node,
  depth,
  folderPath,
  filterLower,
  autoExpand,
  expandedPaths,
  onToggleExpand,
  selectedPath,
  getFileStatus,
  isFileVisible,
  onSelectFile,
}: {
  node: DiffTreeNode;
  depth: number;
  folderPath: string;
  filterLower: string;
  autoExpand: boolean;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  selectedPath: string | null;
  getFileStatus: (path: string) => DiffStatusValue | undefined;
  isFileVisible: (file: DiffTreeFile) => boolean;
  onSelectFile: (path: string) => void;
}) {
  const foldersWithStatus = node.sortedChildren
    .map(([name, child]) => ({ name, child, status: computeFolderStatus(child, getFileStatus, isFileVisible) }))
    .filter((entry): entry is { name: string; child: DiffTreeNode; status: FolderStatus } => entry.status !== null);

  const files = node.sortedFiles.filter((f) => isFileVisible(f));

  const singleChild = foldersWithStatus.length + files.length === 1;

  return (
    <>
      {foldersWithStatus.map(({ name, child, status }) => {
        const childPath = folderPath ? `${folderPath}\\${name}` : name;
        return (
          <DiffFolderNode
            key={childPath}
            name={name}
            node={child}
            depth={depth}
            folderPath={childPath}
            folderStatus={status}
            filterLower={filterLower}
            autoExpand={autoExpand}
            expandedPaths={expandedPaths}
            onToggleExpand={onToggleExpand}
            selectedPath={selectedPath}
            getFileStatus={getFileStatus}
            isFileVisible={isFileVisible}
            onSelectFile={onSelectFile}
            singleChild={singleChild}
          />
        );
      })}
      {files.map((file) => (
        <DiffFileRow
          key={file.fullPath}
          file={file}
          depth={depth}
          filterLower={filterLower}
          isSelected={file.fullPath === selectedPath}
          getFileStatus={getFileStatus}
          onSelect={onSelectFile}
        />
      ))}
    </>
  );
}

// --- DiffTree ---

interface DiffTreeProps {
  root: DiffTreeNode | null;
  selectedPath: string | null;
  filterText: string;
  activeFilters: Set<DiffStatusValue>;
  getFileStatus: (path: string) => DiffStatusValue | undefined;
  onSelectFile: (path: string) => void;
}

export function DiffTree({
  root,
  selectedPath,
  filterText,
  activeFilters,
  getFileStatus,
  onSelectFile,
}: DiffTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (!root) return null;

  const filterLower = filterText.toLowerCase();
  const autoExpand = filterLower.length > 0;

  const isFileVisible = (file: DiffTreeFile): boolean => {
    const status = getFileStatus(file.fullPath) ?? file.status;
    if (activeFilters.size > 0 && !activeFilters.has(status)) return false;
    if (filterLower && !file.fullPath.toLowerCase().includes(filterLower)) return false;
    return true;
  };

  return (
    <DiffNodeContents
      node={root}
      depth={0}
      folderPath=""
      filterLower={filterLower}
      autoExpand={autoExpand}
      expandedPaths={expandedPaths}
      onToggleExpand={handleToggleExpand}
      selectedPath={selectedPath}
      getFileStatus={getFileStatus}
      isFileVisible={isFileVisible}
      onSelectFile={onSelectFile}
    />
  );
}
