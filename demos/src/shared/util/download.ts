import type { PackageView } from '../package';

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadFile(path: string, pkg: PackageView): Promise<void> {
  const data = await pkg.read(path);
  if (!data) throw new Error(`File not found: ${path}`);
  downloadBlob(new Blob([data.buffer as ArrayBuffer]), path.split(/[\\/]/).pop()!);
}
