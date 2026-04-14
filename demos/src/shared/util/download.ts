export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadFile(path: string, getData: (path: string) => Promise<Uint8Array>): Promise<void> {
  return getData(path).then((data) => {
    downloadBlob(new Blob([data.buffer as ArrayBuffer]), path.split(/[\\/]/).pop()!);
  });
}
