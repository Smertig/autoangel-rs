import type { ReactNode } from 'react';
import type { Edge } from '../index/types';
import type { AutoangelModule } from '../../types/autoangel';
import type { PackageView } from '@shared/package';
import { FileHoverTarget } from '@shared/components/hover-preview/FileHoverTarget';
import { dedupeEdges } from './dedupeEdges';
import styles from './RefsPanel.module.css';

interface HoverDeps {
  pkg?: PackageView;
  wasm?: AutoangelModule;
}

type ResolvedHoverDeps = Required<HoverDeps>;

function isHoverable(h: HoverDeps): h is ResolvedHoverDeps {
  return h.pkg != null && h.wasm != null;
}

export interface RefsPanelProps extends HoverDeps {
  outgoing: Edge[];
  incoming: Edge[];
  onNavigate: (canonicalPath: string) => void;
  /** When undefined, the rail renders a "Select a file" placeholder
   *  instead of the empty Outgoing/Used by sections. */
  selectedPath?: string | null;
}

function groupByKind(edges: Edge[]): Map<string, Edge[]> {
  const m = new Map<string, Edge[]>();
  for (const e of edges) {
    const arr = m.get(e.kind);
    if (arr) arr.push(e);
    else m.set(e.kind, [e]);
  }
  return m;
}

/** Split a normalized path (`gfx/foo/bar.ski`) into its parent dir
 *  and basename. Root-level paths return `dir=''`. */
function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf('/');
  if (i < 0) return { dir: '', name: path };
  return { dir: path.slice(0, i), name: path.slice(i + 1) };
}

interface DirGroup<T> {
  dir: string;
  rows: Array<{ name: string; item: T }>;
}

/** Group items by parent directory (alphabetical), filenames sorted
 *  ascending within each dir. */
function groupByDir<T>(
  items: T[],
  getPath: (t: T) => string,
): Array<DirGroup<T>> {
  const buckets = new Map<string, Array<{ name: string; item: T }>>();
  for (const item of items) {
    const { dir, name } = splitPath(getPath(item));
    const arr = buckets.get(dir);
    const row = { name, item };
    if (arr) arr.push(row);
    else buckets.set(dir, [row]);
  }
  const out: Array<DirGroup<T>> = [];
  for (const [dir, rows] of buckets) {
    rows.sort((a, b) => a.name.localeCompare(b.name));
    out.push({ dir, rows });
  }
  out.sort((a, b) => a.dir.localeCompare(b.dir));
  return out;
}

function MaybeHoverWrapped({
  hover, path, children,
}: {
  hover: HoverDeps;
  path: string;
  children: ReactNode;
}) {
  if (!isHoverable(hover)) return <>{children}</>;
  return (
    <FileHoverTarget path={path} pkg={hover.pkg} wasm={hover.wasm}>
      {children}
    </FileHoverTarget>
  );
}

export function RefsPanel({
  outgoing,
  incoming,
  onNavigate,
  selectedPath,
  pkg,
  wasm,
}: RefsPanelProps) {
  if (selectedPath == null) {
    return (
      <aside className={styles.panel}>
        <RailHeader outgoingCount={0} incomingCount={0} />
        <div className={styles.placeholder}>
          Select a file to see its references.
        </div>
      </aside>
    );
  }
  const hover: HoverDeps = { pkg, wasm };
  // Dedupe by (kind, fromPath, target) so e.g. ten gfx events firing the
  // same .gfx file collapse to one row. The header counts match what's
  // shown.
  const dedupedOutgoing = dedupeEdges(outgoing);
  const dedupedIncoming = dedupeEdges(incoming);
  const grouped = groupByKind(dedupedOutgoing);
  return (
    <aside className={styles.panel}>
      <RailHeader
        outgoingCount={dedupedOutgoing.length}
        incomingCount={dedupedIncoming.length}
      />
      <Section title="Outgoing" empty="No outgoing references.">
        {grouped.size > 0
          ? [...grouped.entries()].map(([kind, edges]) => (
              <KindGroup
                key={kind}
                kind={kind}
                edges={edges}
                onNavigate={onNavigate}
                hover={hover}
              />
            ))
          : null}
      </Section>
      <Section title="Used by" empty="No incoming references.">
        {dedupedIncoming.length > 0 ? (
          <DirGroupedList
            edges={dedupedIncoming}
            getPath={(e) => e.fromPath}
            onClick={(e) => onNavigate(e.fromPath)}
            // Incoming rows show the source's kind (this slot is `kind`
            // referenced by `e.fromPath`).
            kindLabel={(e) => e.kind}
            hover={hover}
          />
        ) : null}
      </Section>
    </aside>
  );
}

function RailHeader({
  outgoingCount,
  incomingCount,
}: {
  outgoingCount: number;
  incomingCount: number;
}) {
  return (
    <div className={styles.railHeader}>
      <h3 className={styles.railTitle}>References</h3>
      <span className={styles.railCounts}>
        ↗ {outgoingCount.toLocaleString()} · ↙ {incomingCount.toLocaleString()}
      </span>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const isEmpty =
    children == null ||
    (Array.isArray(children) && children.length === 0);
  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      {isEmpty ? <div className={styles.empty}>{empty}</div> : children}
    </div>
  );
}

function KindGroup({
  kind,
  edges,
  onNavigate,
  hover,
}: {
  kind: string;
  edges: Edge[];
  onNavigate: (p: string) => void;
  hover: HoverDeps;
}) {
  // Within a kind, group by parent dir as well — keeps the layout
  // consistent with "Used by" and trims repeated path prefixes.
  return (
    <div className={styles.group}>
      <h5 className={styles.kind}>{kind}</h5>
      <DirGroupedList
        edges={edges}
        getPath={(e) => e.resolved ?? e.raw}
        onClick={(e) => {
          if (e.resolved !== null) onNavigate(e.resolved);
        }}
        hover={hover}
        renderRow={(e, name) => {
          if (e.resolved === null) {
            return (
              <span
                data-resolved="false"
                className={styles.broken}
                title={`Unresolved: ${e.raw}`}
              >
                {name}
              </span>
            );
          }
          return (
            <MaybeHoverWrapped hover={hover} path={e.resolved}>
              <button
                className={styles.link}
                onClick={() => onNavigate(e.resolved!)}
                title={e.resolved}
              >
                {name}
              </button>
            </MaybeHoverWrapped>
          );
        }}
      />
    </div>
  );
}

function DirGroupedList({
  edges,
  getPath,
  onClick,
  kindLabel,
  renderRow,
  hover,
}: {
  edges: Edge[];
  getPath: (e: Edge) => string;
  onClick: (e: Edge) => void;
  kindLabel?: (e: Edge) => string;
  /** Override row rendering (for outgoing's resolved/dangling split). */
  renderRow?: (e: Edge, name: string) => ReactNode;
  hover: HoverDeps;
}) {
  const groups = groupByDir(edges, getPath);
  return (
    <div className={styles.dirGroups}>
      {groups.map(({ dir, rows }) => (
        <div key={dir} className={styles.dirGroup}>
          {dir && (
            <div className={styles.dirHeader} title={dir}>
              {dir}/
            </div>
          )}
          <ul className={styles.list}>
            {rows.map(({ name, item: e }, i) => {
              let row: ReactNode;
              if (renderRow) {
                row = renderRow(e, name);
              } else {
                const path = getPath(e);
                row = (
                  <MaybeHoverWrapped hover={hover} path={path}>
                    <button
                      className={styles.link}
                      onClick={() => onClick(e)}
                      title={path}
                    >
                      {name}
                    </button>
                  </MaybeHoverWrapped>
                );
              }
              return (
                <li key={i} className={styles.dirRow}>
                  {row}
                  {kindLabel && (
                    <span className={styles.kindLabel}>{kindLabel(e)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
