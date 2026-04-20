import { describe, it, expect } from 'vitest';
import {
  TEXT_EXTENSIONS,
  MODEL_EXTENSIONS,
  BINARY_EXTENSIONS,
  IMAGE_EXTENSIONS,
  CANVAS_IMAGE_EXTENSIONS,
  IMAGE_MIME,
  HLJS_LANG,
  ENCODINGS,
  getExtension,
  formatSize,
  escapeHtml,
  classifyFiles,
  classifyMultiPackageDrop,
  isLikelyText,
} from '../files';

// ---------------------------------------------------------------------------
// Extension sets
// ---------------------------------------------------------------------------

describe('extension sets', () => {
  it('TEXT_EXTENSIONS contains expected entries', () => {
    expect(TEXT_EXTENSIONS.has('.txt')).toBe(true);
    expect(TEXT_EXTENSIONS.has('.xml')).toBe(true);
    expect(TEXT_EXTENSIONS.has('.json')).toBe(true);
    expect(TEXT_EXTENSIONS.has('.lua')).toBe(true);
    expect(TEXT_EXTENSIONS.has('.gfx')).toBe(false);
  });

  it('MODEL_EXTENSIONS contains .ecm, .smd, .ski and .stck', () => {
    expect(MODEL_EXTENSIONS.has('.ecm')).toBe(true);
    expect(MODEL_EXTENSIONS.has('.smd')).toBe(true);
    expect(MODEL_EXTENSIONS.has('.ski')).toBe(true);
    expect(MODEL_EXTENSIONS.has('.stck')).toBe(true);
    expect(MODEL_EXTENSIONS.size).toBe(4);
  });

  it('BINARY_EXTENSIONS contains expected entries', () => {
    expect(BINARY_EXTENSIONS.has('.exe')).toBe(true);
    expect(BINARY_EXTENSIONS.has('.pck')).toBe(true);
    expect(BINARY_EXTENSIONS.has('.dll')).toBe(true);
    expect(BINARY_EXTENSIONS.has('.mp3')).toBe(true);
  });

  it('IMAGE_EXTENSIONS contains standard image types', () => {
    expect(IMAGE_EXTENSIONS.has('.png')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.jpg')).toBe(true);
    expect(IMAGE_EXTENSIONS.has('.webp')).toBe(true);
  });

  it('CANVAS_IMAGE_EXTENSIONS contains .tga and .dds', () => {
    expect(CANVAS_IMAGE_EXTENSIONS.has('.tga')).toBe(true);
    expect(CANVAS_IMAGE_EXTENSIONS.has('.dds')).toBe(true);
    expect(CANVAS_IMAGE_EXTENSIONS.size).toBe(2);
  });
});

describe('IMAGE_MIME', () => {
  it('maps .png to image/png', () => {
    expect(IMAGE_MIME['.png']).toBe('image/png');
  });

  it('maps .jpg and .jpeg to image/jpeg', () => {
    expect(IMAGE_MIME['.jpg']).toBe('image/jpeg');
    expect(IMAGE_MIME['.jpeg']).toBe('image/jpeg');
  });

  it('maps .ico and .cur to image/x-icon', () => {
    expect(IMAGE_MIME['.ico']).toBe('image/x-icon');
    expect(IMAGE_MIME['.cur']).toBe('image/x-icon');
  });
});

describe('HLJS_LANG', () => {
  it('maps .ini, .cfg, .conf, .properties to ini', () => {
    expect(HLJS_LANG['.ini']).toBe('ini');
    expect(HLJS_LANG['.cfg']).toBe('ini');
    expect(HLJS_LANG['.conf']).toBe('ini');
    expect(HLJS_LANG['.properties']).toBe('ini');
  });

  it('maps .xml and .html variants to xml', () => {
    expect(HLJS_LANG['.xml']).toBe('xml');
    expect(HLJS_LANG['.html']).toBe('xml');
    expect(HLJS_LANG['.htm']).toBe('xml');
    expect(HLJS_LANG['.shtml']).toBe('xml');
  });

  it('maps .yaml and .yml to yaml', () => {
    expect(HLJS_LANG['.yaml']).toBe('yaml');
    expect(HLJS_LANG['.yml']).toBe('yaml');
  });
});

describe('ENCODINGS', () => {
  it('starts with auto', () => {
    expect(ENCODINGS[0]).toBe('auto');
  });

  it('includes common encodings', () => {
    expect(ENCODINGS).toContain('utf-8');
    expect(ENCODINGS).toContain('gbk');
    expect(ENCODINGS).toContain('utf-16le');
    expect(ENCODINGS).toContain('utf-16be');
  });
});

// ---------------------------------------------------------------------------
// getExtension
// ---------------------------------------------------------------------------

describe('getExtension', () => {
  it('returns lowercase extension including the dot', () => {
    expect(getExtension('file.txt')).toBe('.txt');
    expect(getExtension('archive.PKX')).toBe('.pkx');
    expect(getExtension('image.PNG')).toBe('.png');
  });

  it('returns empty string when no extension', () => {
    expect(getExtension('Makefile')).toBe('');
    expect(getExtension('noext')).toBe('');
  });

  it('handles multiple dots — uses last one', () => {
    expect(getExtension('archive.tar.gz')).toBe('.gz');
    expect(getExtension('my.file.name.cfg')).toBe('.cfg');
  });

  it('handles path separators', () => {
    expect(getExtension('path/to/file.xml')).toBe('.xml');
    expect(getExtension('C:\\path\\to\\file.json')).toBe('.json');
  });

  it('returns empty string for filename ending in dot', () => {
    expect(getExtension('file.')).toBe('.');
  });

  it('handles dotfiles (hidden files starting with dot)', () => {
    // ".gitignore" — dot is at index 0, so it has an extension
    expect(getExtension('.gitignore')).toBe('.gitignore');
  });
});

// ---------------------------------------------------------------------------
// formatSize
// ---------------------------------------------------------------------------

describe('formatSize', () => {
  it('formats bytes below 1024 as B', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1)).toBe('1 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('formats exactly 1024 as 1.0 KB', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
  });

  it('formats kilobytes', () => {
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('formats exactly 1 MB as 1.0 MB', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats megabytes', () => {
    expect(formatSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });

  it('boundary: 1023 * 1024 is still KB', () => {
    expect(formatSize(1023 * 1024)).toBe('1023.0 KB');
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<tag')).toBe('&lt;tag');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes all three in combination', () => {
    expect(escapeHtml('<a href="x">foo & bar</a>')).toBe('&lt;a href="x"&gt;foo &amp; bar&lt;/a&gt;');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes multiple occurrences', () => {
    expect(escapeHtml('&&<<>>')).toBe('&amp;&amp;&lt;&lt;&gt;&gt;');
  });
});

// ---------------------------------------------------------------------------
// classifyFiles
// ---------------------------------------------------------------------------

function makeFile(name: string): File {
  return new File([], name);
}

describe('classifyFiles', () => {
  it('identifies .pck file and empty pkxFiles when only pck given', () => {
    const result = classifyFiles([makeFile('data.pck')]);
    expect(result.pck?.name).toBe('data.pck');
    expect(result.pkxFiles).toHaveLength(0);
  });

  it('classifies .pkx as extension part', () => {
    const result = classifyFiles([makeFile('data.pck'), makeFile('data.pkx')]);
    expect(result.pck?.name).toBe('data.pck');
    expect(result.pkxFiles).toHaveLength(1);
    expect(result.pkxFiles[0].name).toBe('data.pkx');
  });

  it('sorts numbered .pkxN files by order', () => {
    const result = classifyFiles([
      makeFile('data.pkx3'),
      makeFile('data.pkx1'),
      makeFile('data.pkx2'),
      makeFile('data.pck'),
    ]);
    expect(result.pck?.name).toBe('data.pck');
    expect(result.pkxFiles.map(f => f.name)).toEqual(['data.pkx1', 'data.pkx2', 'data.pkx3']);
  });

  it('when no .pck, uses first .pkx as pck', () => {
    const result = classifyFiles([makeFile('data.pkx'), makeFile('data.pkx1')]);
    expect(result.pck?.name).toBe('data.pkx');
    expect(result.pkxFiles).toHaveLength(1);
    expect(result.pkxFiles[0].name).toBe('data.pkx1');
  });

  it('returns null pck and empty pkxFiles for empty input', () => {
    const result = classifyFiles([]);
    expect(result.pck).toBeNull();
    expect(result.pkxFiles).toHaveLength(0);
  });

  it('ignores unrelated files', () => {
    const result = classifyFiles([makeFile('readme.txt'), makeFile('image.png')]);
    expect(result.pck).toBeNull();
    expect(result.pkxFiles).toHaveLength(0);
  });

  it('handles uppercase extensions (lowercases name for matching)', () => {
    const result = classifyFiles([makeFile('DATA.PCK')]);
    expect(result.pck?.name).toBe('DATA.PCK');
  });

  it('mixes .pkx (order 0) and numbered pkxN in sorted output', () => {
    const result = classifyFiles([
      makeFile('data.pck'),
      makeFile('data.pkx2'),
      makeFile('data.pkx'),
    ]);
    expect(result.pck?.name).toBe('data.pck');
    // .pkx has order 0, .pkx2 has order 2
    expect(result.pkxFiles.map(f => f.name)).toEqual(['data.pkx', 'data.pkx2']);
  });
});

// ---------------------------------------------------------------------------
// classifyMultiPackageDrop
// ---------------------------------------------------------------------------

describe('classifyMultiPackageDrop', () => {
  it('returns empty packages array for empty input', () => {
    const result = classifyMultiPackageDrop([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packages).toEqual([]);
    }
  });

  it('returns a single package for a single .pck file with no pkx', () => {
    const result = classifyMultiPackageDrop([makeFile('gfx.pck')]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].stem).toBe('gfx');
      expect(result.packages[0].pck.name).toBe('gfx.pck');
      expect(result.packages[0].pkxFiles).toHaveLength(0);
    }
  });

  it('groups a .pck with matching .pkx and .pkx1 into one package, pkx sorted', () => {
    const result = classifyMultiPackageDrop([
      makeFile('models.pkx1'),
      makeFile('models.pck'),
      makeFile('models.pkx'),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].stem).toBe('models');
      expect(result.packages[0].pck.name).toBe('models.pck');
      expect(result.packages[0].pkxFiles.map(f => f.name)).toEqual(['models.pkx', 'models.pkx1']);
    }
  });

  it('matches stems case-insensitively (Models.PCK + models.PKX)', () => {
    const result = classifyMultiPackageDrop([
      makeFile('Models.PCK'),
      makeFile('models.PKX'),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].stem).toBe('models');
      expect(result.packages[0].pck.name).toBe('Models.PCK');
      expect(result.packages[0].pkxFiles.map(f => f.name)).toEqual(['models.PKX']);
    }
  });

  it('returns multiple packages sorted by stem', () => {
    const result = classifyMultiPackageDrop([
      makeFile('models.pck'),
      makeFile('models.pkx'),
      makeFile('gfx.pck'),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packages).toHaveLength(2);
      expect(result.packages[0].stem).toBe('gfx');
      expect(result.packages[0].pck.name).toBe('gfx.pck');
      expect(result.packages[0].pkxFiles).toHaveLength(0);
      expect(result.packages[1].stem).toBe('models');
      expect(result.packages[1].pck.name).toBe('models.pck');
      expect(result.packages[1].pkxFiles.map(f => f.name)).toEqual(['models.pkx']);
    }
  });

  it('returns an error for an orphan .pkx with no matching .pck', () => {
    const result = classifyMultiPackageDrop([makeFile('models.pkx')]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Orphan .pkx: models.pkx has no matching .pck');
    }
  });

  it('returns an error when two .pck files share the same stem', () => {
    const result = classifyMultiPackageDrop([
      makeFile('data.pck'),
      makeFile('data.pck'),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Ambiguous drop: two .pck with stem data');
    }
  });

  it('silently ignores unrelated files', () => {
    const result = classifyMultiPackageDrop([
      makeFile('gfx.pck'),
      makeFile('readme.txt'),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].stem).toBe('gfx');
      expect(result.packages[0].pck.name).toBe('gfx.pck');
      expect(result.packages[0].pkxFiles).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// isLikelyText
// ---------------------------------------------------------------------------

describe('isLikelyText', () => {
  it('returns false for empty data', () => {
    expect(isLikelyText(new Uint8Array([]), '.txt')).toBe(false);
  });

  it('returns false for known binary extension regardless of content', () => {
    const data = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
    expect(isLikelyText(data, '.exe')).toBe(false);
    expect(isLikelyText(data, '.pck')).toBe(false);
    expect(isLikelyText(data, '.dll')).toBe(false);
  });

  it('returns true for known text extension', () => {
    const data = new Uint8Array([0x00, 0x00, 0x00]); // would fail heuristic otherwise
    expect(isLikelyText(data, '.txt')).toBe(true);
    expect(isLikelyText(data, '.xml')).toBe(true);
    expect(isLikelyText(data, '.cfg')).toBe(true);
  });

  it('returns true when UTF-8 BOM present (unknown extension)', () => {
    const data = new Uint8Array([0xEF, 0xBB, 0xBF, 0x41, 0x42]);
    expect(isLikelyText(data, '')).toBe(true);
  });

  it('returns true when UTF-16LE BOM present', () => {
    const data = new Uint8Array([0xFF, 0xFE, 0x41, 0x00]);
    expect(isLikelyText(data, '')).toBe(true);
  });

  it('returns false when null byte found in first 1KB', () => {
    const data = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x00, 0x6F]);
    expect(isLikelyText(data, '')).toBe(false);
  });

  it('returns true for clean ASCII text without extension', () => {
    const text = 'Hello, World! This is a test file.\n';
    const data = new TextEncoder().encode(text);
    expect(isLikelyText(data, '')).toBe(true);
  });

  it('returns false when control character density exceeds 5%', () => {
    // Fill with ~10% control characters (0x01–0x08 range)
    const arr: number[] = [];
    for (let i = 0; i < 100; i++) {
      arr.push(i % 10 === 0 ? 0x03 : 0x41); // 10% are control chars
    }
    expect(isLikelyText(new Uint8Array(arr), '')).toBe(false);
  });

  it('returns true when control character density is below 5%', () => {
    // 2% control characters — should still be considered text
    const arr: number[] = [];
    for (let i = 0; i < 100; i++) {
      arr.push(i % 50 === 0 ? 0x03 : 0x41); // 2% are control chars
    }
    expect(isLikelyText(new Uint8Array(arr), '')).toBe(true);
  });

  it('detects UTF-16LE pattern as text (no extension)', () => {
    const arr: number[] = [];
    for (const c of 'hello world foo bar baz qux') arr.push(c.charCodeAt(0), 0x00);
    expect(isLikelyText(new Uint8Array(arr), '')).toBe(true);
  });
});
