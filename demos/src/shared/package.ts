/**
 * Single file-access port. Replaces the older scattering of
 * `getData` / `getFile` / `findFile` / `listFiles` callbacks.
 *
 *  - `read` returns `null` when no loaded slot has the file. Real errors
 *    (e.g. PackageRemovedError) still reject so callers can distinguish
 *    "no such file" from "the slot just went away".
 *  - `resolve` and `list` are sync — they consult the in-memory index
 *    populated when packages load.
 */
export interface PackageView {
  read(path: string): Promise<Uint8Array | null>;
  resolve(path: string): string | null;
  list(prefix: string): string[];
  resolveEngine(rawPath: string, prefixes: readonly string[]): string | null;
}

export interface CreatePackageViewOpts {
  /** Receives the canonical-cased path returned by `resolve`. */
  getData: (canonicalPath: string) => Promise<Uint8Array>;
  resolve: (path: string) => string | null;
  list: (prefix: string) => string[];
}

export function createPackageView(opts: CreatePackageViewOpts): PackageView {
  return {
    async read(path) {
      const r = opts.resolve(path);
      if (!r) return null;
      return opts.getData(r);
    },
    resolve: opts.resolve,
    list: opts.list,
    resolveEngine(rawPath, prefixes) {
      for (const prefix of prefixes) {
        const r = opts.resolve(prefix + rawPath);
        if (r) return r;
      }
      return null;
    },
  };
}

/** No-op view: every read misses, no paths resolve. Useful as a stub in
 *  tests and as the empty-state default before a slot is loaded. */
export const EMPTY_PACKAGE_VIEW: PackageView = {
  read: async () => null,
  resolve: () => null,
  list: () => [],
  resolveEngine: () => null,
};

/** View backed by a single in-memory file. Used by the diff viewer
 *  (each side has bytes but no index) and by hover renderers that own
 *  pre-fetched bytes. Reads other paths reject. */
export function singleFileView(path: string, data: Uint8Array): PackageView {
  return createPackageView({
    getData: async () => data,
    resolve: (p) => (p === path ? path : null),
    list: () => [],
  });
}
