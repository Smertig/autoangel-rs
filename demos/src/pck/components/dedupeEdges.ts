import type { Edge } from '../index/types';

/**
 * Collapse edges that are duplicates by `(kind, fromPath, target)`. Target is
 * the canonical resolved path, or `raw` if unresolved (so two unresolved
 * references with different raw strings stay separate).
 *
 * The same target reached via different `kind` (e.g. an SMD referenced as
 * `skin-model` AND `animation`) stays as separate rows — different
 * relationships, different intent.
 *
 * Stable: preserves the order of the first occurrence of each unique key.
 */
export function dedupeEdges(edges: readonly Edge[]): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const e of edges) {
    const target = e.resolved ?? `\0raw:${e.raw}`;
    const key = `${e.kind}\0${e.fromPath}\0${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
