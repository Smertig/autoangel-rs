import type { ReactNode } from 'react';
import type { FieldRow } from '../fieldPanel';
import { BoolDot, ColorSwatch, MonoJson, MonoNum, PathOrText } from '../formatters';
import type { ElementBody, GfxElement, ViewerCtx } from '../previews/types';
import type { FindFile } from '../util/resolveEnginePath';
import styles from '../previews/DefaultPreview.module.css';

const ARGB_KEY = /^(color|diffuse|specular|ambient)(_min|_max)?$/;
const SKIP_KEYS = new Set(['tail_lines', 'kind', 'shape', 'raw_lines']);

export function buildDefaultRows(
  body: ElementBody,
  _element: GfxElement,
  ctx: ViewerCtx,
): FieldRow[] {
  const obj = body as unknown as Record<string, unknown>;
  return collectRows(obj, '', ctx.findFile, ctx.onNavigateToFile);
}

function collectRows(
  obj: Record<string, unknown>,
  prefix: string,
  findFile: FindFile,
  onNavigate: ((path: string) => void) | undefined,
): FieldRow[] {
  const entries = Object.entries(obj).filter(([k]) => !SKIP_KEYS.has(k));
  const rows: FieldRow[] = [];
  let i = 0;
  while (i < entries.length) {
    const [k, v] = entries[i];
    if (v === undefined || v === null) { i++; continue; }
    const label = prefix ? `${prefix}.${k}` : k;

    // Min/max pairing — `scale_min` + `scale_max` → single row labeled `scale`.
    const minMatch = k.match(/^(.+)_min$/);
    if (minMatch) {
      const next = entries[i + 1];
      if (next && next[0] === `${minMatch[1]}_max` && next[1] !== undefined && next[1] !== null) {
        const pairLabel = prefix ? `${prefix}.${minMatch[1]}` : minMatch[1];
        rows.push({
          label: pairLabel,
          value: (
            <span>
              {formatLeaf(`${minMatch[1]}_min`, v, findFile, onNavigate)}
              <span className={styles.minMaxSep}>‥</span>
              {formatLeaf(`${minMatch[1]}_max`, next[1], findFile, onNavigate)}
            </span>
          ),
        });
        i += 2;
        continue;
      }
    }

    // Boolean cluster — 3+ consecutive booleans → single `flags` row.
    if (typeof v === 'boolean') {
      let j = i;
      while (j < entries.length && typeof entries[j][1] === 'boolean') j++;
      if (j - i >= 3) {
        const pairs = entries.slice(i, j) as [string, boolean][];
        rows.push({
          label: prefix ? `${prefix}.flags` : 'flags',
          key: `flags-${prefix}-${i}`,
          value: (
            <span className={styles.flagsList}>
              {pairs.map(([fk, on]) => (
                <span key={fk} className={on ? styles.flagOn : styles.flagOff}>
                  <span aria-hidden="true">{on ? '●' : '○'}</span>
                  <span>{fk}</span>
                </span>
              ))}
            </span>
          ),
        });
        i = j;
        continue;
      }
    }

    // Nested plain object → flatten with `parent.child` label prefix.
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const nested = collectRows(
        v as Record<string, unknown>,
        label,
        findFile,
        onNavigate,
      );
      if (nested.length > 0) {
        rows.push({ divider: true });
        rows.push(...nested);
      }
      i++;
      continue;
    }

    rows.push({ label, value: formatLeaf(k, v, findFile, onNavigate) });
    i++;
  }
  return rows;
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
