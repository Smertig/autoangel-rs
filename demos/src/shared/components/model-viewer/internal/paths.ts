export type GetFile = (path: string) => Promise<Uint8Array | null>;

export function withWarnOnThrow(getFileRaw: GetFile): GetFile {
  return async (path) => {
    try { return await getFileRaw(path); }
    catch (e: unknown) {
      console.warn('[model] getFile failed:', path, e instanceof Error ? e.message : e);
      return null;
    }
  };
}
