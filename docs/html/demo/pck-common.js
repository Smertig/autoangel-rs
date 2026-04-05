// --- Extension maps ---

export const TEXT_EXTENSIONS = new Set([
  '.txt', '.cfg', '.ini', '.xml', '.json', '.lua', '.py', '.lst',
  '.action', '.border', '.log', '.csv', '.htm', '.html', '.css',
  '.js', '.shtml', '.conf', '.properties', '.yaml', '.yml',
]);

export const BINARY_EXTENSIONS = new Set([
  '.ani', '.dat', '.data', '.db', '.bin',
  '.exe', '.dll', '.so', '.o', '.obj', '.lib', '.pdb',
  '.zip', '.rar', '.gz', '.7z', '.tar', '.cab',
  '.wav', '.mp3', '.ogg', '.wma', '.flac',
  '.avi', '.mp4', '.wmv', '.flv', '.mkv', '.bik',
  '.ttf', '.otf', '.fon',
  '.doc', '.xls', '.ppt',
  '.pck', '.pkx', '.smd', '.ski', '.bon', '.att', '.ecm', '.gfx', '.stck',
]);

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.cur', '.webp']);

export const CANVAS_IMAGE_EXTENSIONS = new Set(['.tga', '.dds']);

export const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.webp': 'image/webp',
};

export const HLJS_LANG = {
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
};

export const ENCODINGS = ['auto', 'gbk', 'utf-8', 'utf-16le', 'utf-16be', 'shift_jis', 'euc-kr', 'windows-1252', 'iso-8859-1'];

// --- Utilities ---

export function getExtension(path) {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot).toLowerCase() : '';
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- File classification ---

export function classifyFiles(files) {
  let pck = null, pkx = null;
  for (const f of files) {
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext === 'pck') pck = f;
    else if (ext === 'pkx') pkx = f;
  }
  if (!pck && pkx) { pck = pkx; pkx = null; }
  return { pck, pkx };
}

// --- Encoding detection ---

// Returns { encoding, bomLength } or null
export function detectBOM(data) {
  if (data.length >= 3 && data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) return { encoding: 'utf-8', bomLength: 3 };
  if (data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE) return { encoding: 'utf-16le', bomLength: 2 };
  if (data.length >= 2 && data[0] === 0xFE && data[1] === 0xFF) return { encoding: 'utf-16be', bomLength: 2 };
  return null;
}

// Returns 'utf-16le' | 'utf-16be' | null based on alternating null bytes
export function detectUTF16Pattern(data) {
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

export function detectEncoding(data) {
  if (data.length < 2) return 'gbk';
  const bom = detectBOM(data);
  if (bom) return bom.encoding;
  return detectUTF16Pattern(data) || 'gbk';
}

export function decodeText(data, encoding) {
  const bom = detectBOM(data);
  const offset = (bom && bom.encoding === encoding) ? bom.bomLength : 0;
  const view = offset > 0 ? data.subarray(offset) : data;
  return new TextDecoder(encoding).decode(view);
}

// --- Text detection heuristic ---

export function isLikelyText(data, ext) {
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

// --- TGA decoder ---

export function decodeTGA(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const idLen = d.getUint8(0);
  const colorMapType = d.getUint8(1);
  const imageType = d.getUint8(2);
  const width = d.getUint16(12, true);
  const height = d.getUint16(14, true);
  const bpp = d.getUint8(16);
  const descriptor = d.getUint8(17);
  const topToBottom = (descriptor & 0x20) !== 0;

  const colorMapStart = d.getUint16(3, true);
  const colorMapLen = d.getUint16(5, true);
  const colorMapBpp = d.getUint8(7);
  const colorMapBytes = colorMapType ? colorMapLen * (colorMapBpp / 8) : 0;

  let offset = 18 + idLen + colorMapBytes;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const isRLE = imageType >= 9;
  const baseType = isRLE ? imageType - 8 : imageType;

  // Read color map if present
  let colorMap = null;
  if (colorMapType && colorMapLen > 0) {
    const cmBytesPerEntry = colorMapBpp / 8;
    const cmOffset = 18 + idLen;
    colorMap = [];
    for (let i = 0; i < colorMapLen; i++) {
      const o = cmOffset + i * cmBytesPerEntry;
      if (cmBytesPerEntry === 3) colorMap.push([buf[o + 2], buf[o + 1], buf[o], 255]);
      else if (cmBytesPerEntry === 4) colorMap.push([buf[o + 2], buf[o + 1], buf[o], buf[o + 3]]);
      else colorMap.push([buf[o], buf[o], buf[o], 255]);
    }
  }

  // Reusable pixel buffer to avoid per-pixel array allocations
  const px = [0, 0, 0, 255];

  function readPixel() {
    px[3] = 255;
    if (baseType === 1 && colorMap) {
      const idx = (bpp === 16) ? d.getUint16(offset, true) : buf[offset];
      offset += bpp / 8;
      const c = colorMap[idx - colorMapStart] || px;
      px[0] = c[0]; px[1] = c[1]; px[2] = c[2]; px[3] = c[3];
    } else if (baseType === 3) {
      px[0] = px[1] = px[2] = buf[offset++];
      if (bpp === 16) px[3] = buf[offset++];
    } else {
      px[2] = buf[offset++]; px[1] = buf[offset++]; px[0] = buf[offset++];
      if (bpp === 32) px[3] = buf[offset++];
    }
  }

  function writePixel(pixIdx) {
    const row = topToBottom ? Math.floor(pixIdx / width) : height - 1 - Math.floor(pixIdx / width);
    const j = ((row * width) + (pixIdx % width)) * 4;
    pixels[j] = px[0]; pixels[j + 1] = px[1]; pixels[j + 2] = px[2]; pixels[j + 3] = px[3];
  }

  let pixIdx = 0;
  const totalPixels = width * height;

  if (isRLE) {
    while (pixIdx < totalPixels) {
      const packet = buf[offset++];
      const count = (packet & 0x7F) + 1;
      if (packet & 0x80) {
        readPixel();
        for (let i = 0; i < count && pixIdx < totalPixels; i++) writePixel(pixIdx++);
      } else {
        for (let i = 0; i < count && pixIdx < totalPixels; i++) {
          readPixel();
          writePixel(pixIdx++);
        }
      }
    }
  } else {
    for (let i = 0; i < totalPixels; i++) {
      readPixel();
      writePixel(i);
    }
  }

  return new ImageData(pixels, width, height);
}

// --- DDS decoder (DXT1/DXT3/DXT5 + uncompressed) ---

export function unpackRGB565(c) {
  return [
    ((c >> 11) & 0x1F) * 255 / 31 | 0,
    ((c >> 5) & 0x3F) * 255 / 63 | 0,
    (c & 0x1F) * 255 / 31 | 0,
  ];
}

export function decodeDXTBlock(buf, offset) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const c0 = d.getUint16(offset, true);
  const c1 = d.getUint16(offset + 2, true);
  const lut = d.getUint32(offset + 4, true);
  const [r0, g0, b0] = unpackRGB565(c0);
  const [r1, g1, b1] = unpackRGB565(c1);

  const colors = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
  ];

  if (c0 > c1) {
    colors[2] = [(2 * r0 + r1) / 3 | 0, (2 * g0 + g1) / 3 | 0, (2 * b0 + b1) / 3 | 0, 255];
    colors[3] = [(r0 + 2 * r1) / 3 | 0, (g0 + 2 * g1) / 3 | 0, (b0 + 2 * b1) / 3 | 0, 255];
  } else {
    colors[2] = [(r0 + r1) / 2 | 0, (g0 + g1) / 2 | 0, (b0 + b1) / 2 | 0, 255];
    colors[3] = [0, 0, 0, 0];
  }

  return { colors, lut };
}

export function decodeDXT1(buf, offset, w, h, pixels) {
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const { colors, lut } = decodeDXTBlock(buf, offset);
      offset += 8;
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py;
          if (x >= w || y >= h) continue;
          const idx = (lut >> (2 * (4 * py + px))) & 3;
          const c = colors[idx];
          const j = (y * w + x) * 4;
          pixels[j] = c[0]; pixels[j + 1] = c[1]; pixels[j + 2] = c[2]; pixels[j + 3] = c[3];
        }
      }
    }
  }
}

export function decodeDXT3(buf, offset, w, h, pixels) {
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      // 8 bytes of alpha (4-bit per pixel)
      const alphaData = new Uint8Array(16);
      for (let i = 0; i < 4; i++) {
        const row = buf[offset + i * 2] | (buf[offset + i * 2 + 1] << 8);
        for (let j = 0; j < 4; j++) {
          alphaData[i * 4 + j] = ((row >> (j * 4)) & 0xF) * 17;
        }
      }
      offset += 8;

      const { colors, lut } = decodeDXTBlock(buf, offset);
      offset += 8;
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py;
          if (x >= w || y >= h) continue;
          const idx = (lut >> (2 * (4 * py + px))) & 3;
          const c = colors[idx];
          const j = (y * w + x) * 4;
          pixels[j] = c[0]; pixels[j + 1] = c[1]; pixels[j + 2] = c[2];
          pixels[j + 3] = alphaData[py * 4 + px];
        }
      }
    }
  }
}

export function decodeDXT5(buf, offset, w, h, pixels) {
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const a0 = buf[offset], a1 = buf[offset + 1];
      // 6 bytes = 48 bits of 3-bit indices, split into two 24-bit halves
      const alphaLo = buf[offset + 2] | (buf[offset + 3] << 8) | (buf[offset + 4] << 16);
      const alphaHi = buf[offset + 5] | (buf[offset + 6] << 8) | (buf[offset + 7] << 16);
      offset += 8;

      const alphaTable = [a0, a1];
      if (a0 > a1) {
        for (let i = 1; i <= 6; i++) alphaTable.push(((7 - i) * a0 + i * a1) / 7 | 0);
      } else {
        for (let i = 1; i <= 4; i++) alphaTable.push(((5 - i) * a0 + i * a1) / 5 | 0);
        alphaTable.push(0, 255);
      }

      const { colors, lut } = decodeDXTBlock(buf, offset);
      offset += 8;
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py;
          if (x >= w || y >= h) continue;
          const idx = (lut >> (2 * (4 * py + px))) & 3;
          const c = colors[idx];
          const bitPos = 3 * (py * 4 + px);
          const aIdx = bitPos < 24
            ? (alphaLo >> bitPos) & 7
            : (alphaHi >> (bitPos - 24)) & 7;
          const j = (y * w + x) * 4;
          pixels[j] = c[0]; pixels[j + 1] = c[1]; pixels[j + 2] = c[2];
          pixels[j + 3] = alphaTable[aIdx];
        }
      }
    }
  }
}

export function decodeUncompressedDDS(buf, offset, w, h, bpp, rMask, gMask, bMask, aMask, pixels) {
  const bytesPerPixel = bpp / 8;
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  function maskShift(mask) {
    if (!mask) return [0, 0];
    let shift = 0, bits = 0;
    let m = mask;
    while ((m & 1) === 0) { shift++; m >>= 1; }
    while (m & 1) { bits++; m >>= 1; }
    return [shift, bits];
  }

  const [rShift, rBits] = maskShift(rMask);
  const [gShift, gBits] = maskShift(gMask);
  const [bShift, bBits] = maskShift(bMask);
  const [aShift, aBits] = maskShift(aMask);

  const scale = (val, bits) => bits ? (val * 255 / ((1 << bits) - 1)) | 0 : 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let pixel = 0;
      for (let b = 0; b < bytesPerPixel; b++) pixel |= buf[offset++] << (b * 8);
      const j = (y * w + x) * 4;
      pixels[j] = scale((pixel & rMask) >>> rShift, rBits);
      pixels[j + 1] = scale((pixel & gMask) >>> gShift, gBits);
      pixels[j + 2] = scale((pixel & bMask) >>> bShift, bBits);
      pixels[j + 3] = aMask ? scale((pixel & aMask) >>> aShift, aBits) : 255;
    }
  }
}

export function decodeDDS(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  if (d.getUint32(0, true) !== 0x20534444) throw new Error('Not a DDS file');

  const height = d.getUint32(12, true);
  const width = d.getUint32(16, true);
  const pfFlags = d.getUint32(80, true);
  const fourCC = d.getUint32(84, true);
  const rgbBitCount = d.getUint32(88, true);
  const rMask = d.getUint32(92, true);
  const gMask = d.getUint32(96, true);
  const bMask = d.getUint32(100, true);
  const aMask = d.getUint32(104, true);

  const dataOffset = 128;
  const pixels = new Uint8ClampedArray(width * height * 4);

  const FOURCC = pfFlags & 0x4;
  const DXT1 = 0x31545844;
  const DXT3 = 0x33545844;
  const DXT5 = 0x35545844;

  if (FOURCC && fourCC === DXT1) {
    decodeDXT1(buf, dataOffset, width, height, pixels);
  } else if (FOURCC && fourCC === DXT3) {
    decodeDXT3(buf, dataOffset, width, height, pixels);
  } else if (FOURCC && fourCC === DXT5) {
    decodeDXT5(buf, dataOffset, width, height, pixels);
  } else if (pfFlags & 0x40) {
      decodeUncompressedDDS(buf, dataOffset, width, height, rgbBitCount, rMask, gMask, bMask, aMask, pixels);
  } else {
    throw new Error(`Unsupported DDS format (fourCC: 0x${fourCC.toString(16)})`);
  }

  return new ImageData(pixels, width, height);
}
