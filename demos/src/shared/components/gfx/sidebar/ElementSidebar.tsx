import type { ElementBody } from '../previews/types';
import { formatKindBadge } from '../util/kindLabel';
import { keyOf, type TreeRow } from './buildTree';
import styles from './ElementSidebar.module.css';

interface Props {
  tree: TreeRow[];
  enabled: Set<string>;
  solo: string | null;
  expanded: Set<string>;
  selectedIndex: string | null;
  isSupported: (kind: ElementBody['kind']) => boolean;
  onToggle: (key: string) => void;
  onSolo: (key: string) => void;
  onSelect: (key: string) => void;
  onExpandToggle: (key: string) => void;
}

export function ElementSidebar(p: Props) {
  return (
    <div className={styles.sidebar} role="tree">
      {p.tree.map((row) => <Row key={keyOf(row.path)} row={row} depth={0} {...p} />)}
    </div>
  );
}

function Row({ row, depth, ...p }: { row: TreeRow; depth: number } & Props) {
  const k = keyOf(row.path);
  const supported = p.isSupported(row.element.body.kind);
  const checked = p.enabled.has(k);
  const isSolo = p.solo === k;
  const isSelected = p.selectedIndex === k;
  const hasChildren = !!row.children?.length;
  const isExpanded = p.expanded.has(k);

  return (
    <>
      <div
        data-row data-supported={supported ? 'true' : 'false'}
        className={`${styles.row} ${isSelected ? styles.selected : ''} ${isSolo ? styles.soloed : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={(e) => e.shiftKey ? p.onSolo(k) : p.onSelect(k)}
      >
        {hasChildren ? (
          <button
            type="button" className={styles.chevron}
            aria-expanded={isExpanded}
            onClick={(e) => { e.stopPropagation(); p.onExpandToggle(k); }}
          >▸</button>
        ) : <span className={styles.chevronSpacer} />}

        <input
          type="checkbox" className={styles.checkbox}
          checked={checked} onChange={() => p.onToggle(k)}
          onClick={(e) => e.stopPropagation()}
        />

        <span className={styles.kindBadge}>
          {!supported && <span aria-hidden style={{ marginRight: 4 }}>⊘</span>}
          {formatKindBadge(row.element)}
        </span>

        <span className={styles.name} title={row.element.name || '<unnamed>'}>
          {row.element.name || <em>&lt;unnamed&gt;</em>}
        </span>

        <button
          type="button" className={styles.soloBtn}
          title="Solo (shift+click row)"
          onClick={(e) => { e.stopPropagation(); p.onSolo(k); }}
        >S</button>
      </div>
      {hasChildren && isExpanded && row.children!.map(child =>
        <Row key={keyOf(child.path)} row={child} depth={depth + 1} {...p} />,
      )}
    </>
  );
}
