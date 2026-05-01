import { normalizePath } from '@shared/util/path';

/** Walks `candidates` against the path index. Returns the canonical
 *  (originally-stored) path of the first candidate whose normalized key
 *  hits, or null. The index map is keyed on normalized lowercase. */
export function resolveCandidates(
  candidates: readonly string[],
  pathIndex: Map<string, string>,
): string | null {
  for (const c of candidates) {
    const hit = pathIndex.get(normalizePath(c));
    if (hit) return hit;
  }
  return null;
}

/** For each dir-candidate prefix in priority order, finds all entries
 *  whose normalized key starts with `<dir>/` and ends with `dirExt`.
 *  Returns canonical paths sorted ascending. Stops at the first
 *  dir-candidate that yields any matches. */
export function expandDirRef(
  dirCandidates: readonly string[],
  dirExt: string,
  pathIndex: Map<string, string>,
): string[] {
  const ext = dirExt.toLowerCase();
  for (const dir of dirCandidates) {
    const dirKey = normalizePath(dir);
    const prefix = dirKey.endsWith('/') ? dirKey : dirKey + '/';
    const out: string[] = [];
    for (const [key, canonical] of pathIndex) {
      if (key.startsWith(prefix) && key.endsWith(ext)) {
        out.push(canonical);
      }
    }
    if (out.length > 0) return out.sort((a, b) => a.localeCompare(b));
  }
  return [];
}
