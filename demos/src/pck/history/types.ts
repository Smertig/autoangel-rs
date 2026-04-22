/** Persistent history of PCK package sessions the user has opened locally. */

export interface SessionFile {
  /** Stable id derived from `name|size|lastModified` (lowercased name). */
  fileId: string;
  /** Original `.pck` filename (e.g. `gfx.pck`). */
  pckName: string;
  pckSize: number;
}

export interface Session {
  /** Stable hash of the sorted `files[].fileId` values — same set = same session. */
  id: string;
  files: SessionFile[];
  firstOpenedAt: number;
  lastUsedAt: number;
  /** Number of times this exact set has been loaded. */
  openCount: number;
  /** Tree-file selections recorded while this session was active. */
  exploredCount: number;
}

/** Stable id for a single dropped file. */
export function fileFingerprint(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name.toLowerCase()}|${file.size}|${file.lastModified}`;
}

/** Stable session id from a list of file ids. Order-independent. */
export function sessionIdFromFileIds(fileIds: readonly string[]): string {
  return [...fileIds].sort().join('\n');
}
