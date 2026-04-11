export interface HexRow {
  offset: string;
  hex: string;
  ascii: string;
}

export function hexDumpRows(data: Uint8Array, maxBytes = 4096): HexRow[] {
  const bytes = data.subarray(0, maxBytes);
  const rows: HexRow[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.subarray(i, i + 16);
    rows.push({
      offset: i.toString(16).padStart(8, '0'),
      hex: [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47),
      ascii: [...chunk].map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join(''),
    });
  }
  return rows;
}
