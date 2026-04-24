import { ReactNode } from 'react';
import { MonoNum, ColorSwatch, BoolDot, PathOrText, MonoJson } from '../formatters';
import type { PreviewProps } from './types';
import type { FindFile } from '../util/resolveEnginePath';
import styles from './DefaultPreview.module.css';

const ARGB_KEY = /^(color|diffuse|specular|ambient)(_min|_max)?$/;

export function DefaultPreview({ body, expanded, context }: PreviewProps) {
  if (!expanded) {
    // Collapsed — just a tinted glyph thumbnail. The ElementCard header
    // shouldn't carry the full field dump.
    const kindInitial = (body as { kind: string }).kind.charAt(0).toUpperCase();
    return <span className={styles.thumb}>{kindInitial}</span>;
  }

  const obj = body as unknown as Record<string, unknown>;
  const tailLines = (body as unknown as { tail_lines?: string[] }).tail_lines ?? [];

  return (
    <div className={styles.panel}>
      {renderEntries(obj, context.findFile, context.onNavigateToFile, 0)}
      {tailLines.length > 0 && (
        <details className={styles.unparsed}>
          <summary className={styles.unparsedSummary}>
            unparsed · {tailLines.length} lines
          </summary>
          <pre className={styles.unparsedBody}>{tailLines.join('\n')}</pre>
        </details>
      )}
    </div>
  );
}

function renderEntries(
  obj: Record<string, unknown>,
  findFile: FindFile,
  onNavigate: ((path: string) => void) | undefined,
  depth: number,
): ReactNode[] {
  const entries = Object.entries(obj).filter(
    ([k]) => k !== 'tail_lines' && k !== 'kind' && k !== 'shape' && k !== 'raw_lines',
  );
  const rows: ReactNode[] = [];
  let i = 0;
  while (i < entries.length) {
    const [k, v] = entries[i];
    if (v === undefined || v === null) { i++; continue; }

    // Min/max pairing — `scale_min` + `scale_max` → single row labeled `scale`.
    const minMatch = k.match(/^(.+)_min$/);
    if (minMatch) {
      const next = entries[i + 1];
      if (next && next[0] === `${minMatch[1]}_max` && next[1] !== undefined && next[1] !== null) {
        rows.push(
          <Row key={k} label={minMatch[1]}>
            {formatLeaf(`${minMatch[1]}_min`, v, findFile, onNavigate)}
            <span className={styles.minMaxSep}>‥</span>
            {formatLeaf(`${minMatch[1]}_max`, next[1], findFile, onNavigate)}
          </Row>,
        );
        i += 2;
        continue;
      }
    }

    // Boolean cluster — 3+ consecutive booleans → single `flags` row.
    if (typeof v === 'boolean') {
      let j = i;
      while (j < entries.length && typeof entries[j][1] === 'boolean') j++;
      if (j - i >= 3) {
        rows.push(<FlagsCluster key={`flags-${i}`} pairs={entries.slice(i, j) as [string, boolean][]} />);
        i = j;
        continue;
      }
    }

    // Nested plain object → section with indented children. No box,
    // no grid-in-grid; just a labelled subhead + a left rule.
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      rows.push(
        <div key={k} className={styles.section}>
          <div className={styles.sectionLabel}>{k}</div>
          <div className={styles.sectionBody}>
            {renderEntries(v as Record<string, unknown>, findFile, onNavigate, depth + 1)}
          </div>
        </div>,
      );
      i++;
      continue;
    }

    rows.push(<Row key={k} label={k}>{formatLeaf(k, v, findFile, onNavigate)}</Row>);
    i++;
  }
  return rows;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{children}</span>
    </div>
  );
}

function FlagsCluster({ pairs }: { pairs: [string, boolean][] }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>flags</span>
      <span className={styles.rowValue}>
        <span className={styles.flagsList}>
          {pairs.map(([k, on]) => (
            <span key={k} className={on ? styles.flagOn : styles.flagOff}>
              <span aria-hidden="true">{on ? '●' : '○'}</span>
              <span>{k}</span>
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}

function formatLeaf(
  key: string,
  value: unknown,
  findFile: FindFile,
  onNavigate: ((path: string) => void) | undefined,
): ReactNode {
  if (value === null || value === undefined) {
    return <span className={styles.nullValue}>∅</span>;
  }
  if (typeof value === 'boolean') return <BoolDot on={value} />;
  if (typeof value === 'number') {
    if (ARGB_KEY.test(key)) return <ColorSwatch argb={value} />;
    return <MonoNum value={value} />;
  }
  if (Array.isArray(value)) {
    if (value.length === 3 && value.every((x) => typeof x === 'number')) {
      return (
        <span className={styles.vec}>
          <MonoNum value={value[0] as number} />, <MonoNum value={value[1] as number} />, <MonoNum value={value[2] as number} />
        </span>
      );
    }
    if (value.length === 2 && value.every((x) => typeof x === 'number')) {
      return (
        <span className={styles.vec}>
          <MonoNum value={value[0] as number} />, <MonoNum value={value[1] as number} />
        </span>
      );
    }
    if (value.length === 2 && value.every((x) => typeof x === 'boolean')) {
      return (
        <span className={styles.flagsList}>
          <BoolDot on={value[0] as boolean} /> <BoolDot on={value[1] as boolean} />
        </span>
      );
    }
    if (value.every((x) => typeof x === 'string')) {
      return <span>{(value as string[]).join(', ')}</span>;
    }
    return <MonoJson value={value} />;
  }
  if (typeof value === 'string') return <PathOrText value={value} findFile={findFile} onNavigate={onNavigate} />;
  return <MonoJson value={value} />;
}
