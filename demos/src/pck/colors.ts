/**
 * Curated, colorblind-differentiable, desaturated palette used to tag loaded
 * PCK packages in the multi-package viewer. The values are chosen to coexist
 * with the existing `--accent` without competing with it.
 */
export const PACKAGE_COLORS = [
  '#4f9cd9', // steel blue
  '#c9844e', // ochre
  '#6fa86f', // sage
  '#b86f9c', // muted rose
  '#9a8ec4', // lavender-grey
  '#d9b84f', // mustard
] as const;

/**
 * Allocates palette indices for loaded packages with free-list reclamation.
 *
 * `allocate()` returns the lowest free index in `[0, PACKAGE_COLORS.length)`
 * and marks it taken. If all indices are in use, it cycles back to index 0
 * (two packages share that color — the rare 7+ package case).
 *
 * `release(index)` returns the index to the free list. Releasing an index
 * that is out of range, not currently allocated, or already released is a
 * silent no-op.
 */
export class ColorAllocator {
  private readonly taken: Set<number> = new Set();

  allocate(): { index: number; color: string } {
    for (let i = 0; i < PACKAGE_COLORS.length; i++) {
      if (!this.taken.has(i)) {
        this.taken.add(i);
        return { index: i, color: PACKAGE_COLORS[i] };
      }
    }
    // All indices taken — cycle back to 0.
    return { index: 0, color: PACKAGE_COLORS[0] };
  }

  release(index: number): void {
    this.taken.delete(index);
  }
}
