import type { GfxElement } from '../types';

export interface TreeRow {
  /** Stable index path: [0, 2, 1] = root.elements[0].children[2].children[1]. */
  path: readonly number[];
  element: GfxElement;
  /** Undefined for non-containers. Empty array for unresolvable / cyclic containers. */
  children?: TreeRow[];
}

/** Stable string key for a tree path. Use everywhere a row needs a Map key
 *  or a React key. Round-trips through `parseKey`. */
export const keyOf = (path: readonly number[]): string => path.join('.');
export const parseKey = (key: string): number[] => key.split('.').map(Number);

/** Walk the tree once and emit (key → element) so callers don't re-walk
 *  the structure for every drawer-open or visibility check. */
export function flattenTree(rows: TreeRow[]): Map<string, GfxElement> {
  const out = new Map<string, GfxElement>();
  const walk = (rs: TreeRow[]) => {
    for (const r of rs) {
      out.set(keyOf(r.path), r.element);
      if (r.children) walk(r.children);
    }
  };
  walk(rows);
  return out;
}

export interface TreeCtx {
  resolve: (gfxPath: string) => { elements: GfxElement[] } | null;
  /** Resolved gfx_path strings of ancestor containers, used to short-circuit cycles. */
  visiting: Set<string>;
}

export function buildTree(
  gfx: { elements: GfxElement[] },
  ctx: TreeCtx,
  parentPath: readonly number[] = [],
  ancestorGfx: ReadonlySet<object> = new Set([gfx]),
): TreeRow[] {
  return gfx.elements.map((el, i): TreeRow => {
    const path: readonly number[] = [...parentPath, i];
    if (el.body.kind === 'container' && el.body.gfx_path) {
      if (ctx.visiting.has(el.body.gfx_path)) {
        return { path, element: el, children: [] };
      }
      const child = ctx.resolve(el.body.gfx_path);
      if (!child) return { path, element: el, children: [] };
      // Identity-based cycle detection: if we'd be re-entering a gfx already in our ancestor
      // chain, short-circuit. This catches the case where the root gfx wasn't seeded into
      // `visiting` (it has no path key) but a descendant container resolves back to it.
      if (ancestorGfx.has(child)) return { path, element: el, children: [] };
      const visiting = new Set(ctx.visiting);
      visiting.add(el.body.gfx_path);
      const nextAncestors = new Set(ancestorGfx);
      nextAncestors.add(child);
      return {
        path,
        element: el,
        children: buildTree(child, { ...ctx, visiting }, path, nextAncestors),
      };
    }
    return { path, element: el };
  });
}
