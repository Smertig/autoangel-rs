import { detectBOM, detectUTF16Pattern } from './encoding';

// --- Extension sets ---

export const TEXT_EXTENSIONS = new Set([
  '.txt', '.cfg', '.ini', '.xml', '.json', '.lua', '.py', '.lst',
  '.action', '.border', '.log', '.csv', '.htm', '.html', '.css',
  '.js', '.shtml', '.conf', '.properties', '.yaml', '.yml',
  '.hlsl', '.fx', '.fxh',
]);

export const MODEL_EXTENSIONS = new Set(['.ecm', '.ski', '.stck']);

export const BINARY_EXTENSIONS = new Set([
  '.ani', '.dat', '.data', '.db', '.bin',
  '.exe', '.dll', '.so', '.o', '.obj', '.lib', '.pdb',
  '.zip', '.rar', '.gz', '.7z', '.tar', '.cab',
  '.wav', '.mp3', '.ogg', '.wma', '.flac',
  '.avi', '.mp4', '.wmv', '.flv', '.mkv', '.bik',
  '.ttf', '.otf', '.fon',
  '.doc', '.xls', '.ppt',
  '.pck', '.pkx', '.smd', '.bon', '.att',
]);

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.cur', '.webp']);

export const CANVAS_IMAGE_EXTENSIONS = new Set(['.tga', '.dds']);

export const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.webp': 'image/webp',
};

export const HLJS_LANG: Record<string, string> = {
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.properties': 'ini',
  '.xml': 'xml',
  '.html': 'xml',
  '.htm': 'xml',
  '.shtml': 'xml',
  '.json': 'json',
  '.lua': 'lua',
  '.py': 'python',
  '.js': 'javascript',
  '.css': 'css',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.hlsl': 'glsl',
  '.fx': 'glsl',
  '.fxh': 'glsl',
};

export const ENCODINGS = ['auto', 'gbk', 'utf-8', 'utf-16le', 'utf-16be', 'shift_jis', 'euc-kr', 'windows-1252', 'iso-8859-1'];

// --- Utilities ---

/** Lowercase + normalize forward slashes to backslashes (paths in PCK archives use `\`). */
export function normalizeFilter(text: string): string {
  return text.toLowerCase().replaceAll('/', '\\');
}

export function getExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot).toLowerCase() : '';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- File classification ---

export function classifyFiles(files: FileList | File[]): { pck: File | null; pkxFiles: File[] } {
  let pck: File | null = null;
  const pkxParts: { file: File; order: number }[] = [];
  for (const f of files) {
    const name = f.name.toLowerCase();
    if (name.endsWith('.pck')) {
      pck = f;
    } else if (name.endsWith('.pkx')) {
      pkxParts.push({ file: f, order: 0 });
    } else {
      const m = name.match(/\.pkx(\d+)$/);
      if (m) pkxParts.push({ file: f, order: parseInt(m[1], 10) });
    }
  }
  if (!pck && pkxParts.length > 0) { pck = pkxParts.shift()!.file; }
  pkxParts.sort((a, b) => a.order - b.order);
  const pkxFiles = pkxParts.map(p => p.file);
  return { pck, pkxFiles };
}

/** Return the filename stem (name without its final extension). */
export function fileStem(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(0, dot) : name;
}

export interface PackageDrop {
  /** Lowercased stem (filename without extension), e.g. "models". */
  stem: string;
  pck: File;
  /** Extension parts sorted by numeric suffix; `.pkx` is order 0, `.pkxN` is order N. */
  pkxFiles: File[];
}

export type ClassifyDropResult =
  | { ok: true; packages: PackageDrop[] }
  | { ok: false; error: string };

/**
 * Classify a drop of potentially multiple packages: each stem must have
 * exactly one `.pck` plus any number of `.pkx*` extension parts. Files that
 * are neither `.pck` nor `.pkx*` are silently ignored.
 */
export function classifyMultiPackageDrop(files: FileList | File[]): ClassifyDropResult {
  type Group = { pck: File | null; pkxParts: { file: File; order: number }[] };
  const groups = new Map<string, Group>();

  const getGroup = (stem: string): Group => {
    let g = groups.get(stem);
    if (!g) {
      g = { pck: null, pkxParts: [] };
      groups.set(stem, g);
    }
    return g;
  };

  for (const f of files) {
    const lower = f.name.toLowerCase();
    const stem = fileStem(lower);
    if (lower.endsWith('.pck')) {
      const g = getGroup(stem);
      if (g.pck) {
        return { ok: false, error: `Ambiguous drop: two .pck with stem ${stem}` };
      }
      g.pck = f;
    } else if (lower.endsWith('.pkx')) {
      getGroup(stem).pkxParts.push({ file: f, order: 0 });
    } else {
      const m = lower.match(/\.pkx(\d+)$/);
      if (m) {
        getGroup(stem).pkxParts.push({ file: f, order: parseInt(m[1], 10) });
      }
    }
  }

  const stems = [...groups.keys()].sort();
  const packages: PackageDrop[] = [];
  for (const stem of stems) {
    const g = groups.get(stem)!;
    if (!g.pck) {
      const orphan = g.pkxParts[0].file;
      return { ok: false, error: `Orphan .pkx: ${orphan.name} has no matching .pck` };
    }
    g.pkxParts.sort((a, b) => a.order - b.order);
    packages.push({ stem, pck: g.pck, pkxFiles: g.pkxParts.map(p => p.file) });
  }
  return { ok: true, packages };
}

// --- Text detection heuristic ---

export function isLikelyText(data: Uint8Array, ext: string): boolean {
  if (data.length === 0) return false;
  if (ext && BINARY_EXTENSIONS.has(ext)) return false;
  if (ext && TEXT_EXTENSIONS.has(ext)) return true;
  if (detectBOM(data)) return true;
  if (detectUTF16Pattern(data)) return true;

  // Check first 1KB for null bytes and control character density
  const check = data.subarray(0, Math.min(1024, data.length));
  let controlCount = 0;
  for (let i = 0; i < check.length; i++) {
    const b = check[i];
    if (b === 0) return false;
    if ((b >= 0x01 && b <= 0x08) || (b >= 0x0E && b <= 0x1F)) controlCount++;
  }
  if (check.length > 0 && controlCount / check.length > 0.05) return false;

  return true;
}
