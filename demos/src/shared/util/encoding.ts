// Returns { encoding, bomLength } or null
export function detectBOM(data: Uint8Array): { encoding: string; bomLength: number } | null {
  if (data.length >= 3 && data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) return { encoding: 'utf-8', bomLength: 3 };
  if (data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE) return { encoding: 'utf-16le', bomLength: 2 };
  if (data.length >= 2 && data[0] === 0xFE && data[1] === 0xFF) return { encoding: 'utf-16be', bomLength: 2 };
  return null;
}

// Returns 'utf-16le' | 'utf-16be' | null based on alternating null bytes
export function detectUTF16Pattern(data: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  if (data.length < 4) return null;
  let leScore = 0, beScore = 0;
  const checkLen = Math.min(64, data.length & ~1);
  for (let i = 0; i < checkLen; i += 2) {
    if (data[i] !== 0 && data[i + 1] === 0) leScore++;
    if (data[i] === 0 && data[i + 1] !== 0) beScore++;
  }
  const pairs = checkLen / 2;
  if (leScore > pairs * 0.8) return 'utf-16le';
  if (beScore > pairs * 0.8) return 'utf-16be';
  return null;
}

export function detectEncoding(data: Uint8Array): string {
  if (data.length < 2) return 'gbk';
  const bom = detectBOM(data);
  if (bom) return bom.encoding;
  return detectUTF16Pattern(data) || 'gbk';
}

export function decodeText(data: Uint8Array, encoding: string): string {
  const bom = detectBOM(data);
  const offset = (bom && bom.encoding === encoding) ? bom.bomLength : 0;
  const view = offset > 0 ? data.subarray(offset) : data;
  return new TextDecoder(encoding).decode(view);
}
