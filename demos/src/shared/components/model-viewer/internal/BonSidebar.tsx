import { memo, useState } from 'react';
import styles from './BonSidebar.module.css';

interface BoneNode {
  name: string;
  children: BoneNode[];
  hooks: string[];
}

/** Excludes the synthetic `__root_world__` slot. */
export function buildBoneTree(
  bones: ReadonlyArray<{ name: string; parent: number }>,
  hooks: ReadonlyArray<{ name: string; bone_index: number }>,
): BoneNode[] {
  const nodes: BoneNode[] = bones.map((b) => ({ name: b.name, children: [], hooks: [] }));
  for (const h of hooks) {
    const owner = nodes[h.bone_index];
    if (owner) owner.hooks.push(h.name);
  }
  const roots: BoneNode[] = [];
  for (let i = 0; i < bones.length; i++) {
    if (bones[i].name === '__root_world__') continue;
    const parent = bones[i].parent;
    if (parent < 0 || parent >= bones.length || bones[parent].name === '__root_world__') {
      roots.push(nodes[i]);
    } else {
      nodes[parent].children.push(nodes[i]);
    }
  }
  return roots;
}

export interface SelectedMeta {
  name: string;
  kind: 'bone' | 'hook';
  parent: string | null;
  childCount: number;
  world: { x: number; y: number; z: number } | null;
}

interface BonSidebarProps {
  roots: BoneNode[];
  selected: string | null;
  onSelect: (name: string) => void;
  selectedMeta: SelectedMeta | null;
}

export const BonSidebar = memo(function BonSidebar({
  roots, selected, onSelect, selectedMeta,
}: BonSidebarProps) {
  // Default fully expanded — `collapsed` starts empty, users collapse what
  // they don't care about.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>Skeleton</div>
      <div className={styles.tree}>
        {roots.map((node) => (
          <BoneRow
            key={node.name}
            node={node}
            depth={0}
            collapsed={collapsed}
            toggle={toggle}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </div>
      {selectedMeta && <SelectedFooter meta={selectedMeta} />}
    </aside>
  );
});

function SelectedFooter({ meta }: { meta: SelectedMeta }) {
  return (
    <div className={styles.footer}>
      <div className={styles.footerKind}>
        {meta.kind === 'hook' ? 'Hook' : 'Bone'}
      </div>
      <div className={styles.footerName}>{meta.name}</div>
      <div className={styles.footerRow}>
        <span className={styles.footerKey}>{meta.kind === 'hook' ? 'owner' : 'parent'}</span>
        <span className={styles.footerValue}>{meta.parent ?? '—'}</span>
      </div>
      {meta.kind === 'bone' && (
        <div className={styles.footerRow}>
          <span className={styles.footerKey}>children</span>
          <span className={styles.footerValue}>{meta.childCount}</span>
        </div>
      )}
      {meta.world && (
        <div className={styles.footerCoords}>
          <span>x</span><code>{fmtCoord(meta.world.x)}</code>
          <span>y</span><code>{fmtCoord(meta.world.y)}</code>
          <span>z</span><code>{fmtCoord(meta.world.z)}</code>
        </div>
      )}
    </div>
  );
}

function fmtCoord(v: number): string {
  return v.toFixed(Math.abs(v) < 100 ? 2 : 1);
}

interface BoneRowProps {
  node: BoneNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (key: string) => void;
  selected: string | null;
  onSelect: (name: string) => void;
}

function BoneRow({ node, depth, collapsed, toggle, selected, onSelect }: BoneRowProps) {
  const expandable = node.children.length > 0 || node.hooks.length > 0;
  const isOpen = expandable && !collapsed.has(node.name);
  const indent = { paddingLeft: 8 + depth * 12 };
  const isSelected = selected === node.name;

  return (
    <>
      <div
        className={`${styles.row} ${isSelected ? styles.selected : ''}`}
        style={indent}
        onClick={() => onSelect(node.name)}
      >
        <span
          className={`${styles.chevron} ${expandable ? '' : styles.leaf}`}
          onClick={(e) => {
            if (!expandable) return;
            e.stopPropagation();
            toggle(node.name);
          }}
        >
          {expandable ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <span className={styles.name}>{node.name}</span>
      </div>
      {isOpen && (
        <>
          {node.children.map((c) => (
            <BoneRow
              key={c.name}
              node={c}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
          {node.hooks.map((hookName) => (
            <div
              key={hookName}
              className={`${styles.row} ${styles.hook} ${selected === hookName ? styles.selected : ''}`}
              style={{ paddingLeft: 8 + (depth + 1) * 12 }}
              onClick={() => onSelect(hookName)}
            >
              <span className={`${styles.chevron} ${styles.leaf}`} />
              <span className={styles.glyph}>◆</span>
              <span className={styles.name}>{hookName}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
