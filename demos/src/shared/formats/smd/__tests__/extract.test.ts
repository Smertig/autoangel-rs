import { describe, expect, it } from 'vitest';
import { smdExtractor } from '../extract';

function makeWasm(parsed: {
  skeletonPath?: string;
  skinPaths?: string[];
  tcksDir?: string;
}): any {
  return {
    parseSmd: (_: Uint8Array) => ({
      skeleton_path: parsed.skeletonPath ?? '',
      skin_paths: parsed.skinPaths ?? [],
      tcks_dir: parsed.tcksDir,
    }),
  };
}

describe('smdExtractor', () => {
  it('declares stable identity', () => {
    expect(smdExtractor.name).toBe('smd');
    expect(smdExtractor.ext).toBe('.smd');
  });

  it('emits skeleton, skins, and animation dirRef', () => {
    const wasm = makeWasm({
      skeletonPath: '花苞食人花_b.bon',
      skinPaths: ['利齿绿萼.ski', '利齿绿萼二级.ski'],
      tcksDir: 'tcks_花苞食人花',
    });
    const refs = smdExtractor.extract(
      new Uint8Array(0),
      'models/foo/花苞食人花.smd',
      wasm,
    );
    expect(refs).toEqual([
      {
        kind: 'skeleton',
        raw: '花苞食人花_b.bon',
        candidates: ['models/foo/花苞食人花_b.bon'],
      },
      {
        kind: 'skin',
        raw: '利齿绿萼.ski',
        candidates: ['models/foo/利齿绿萼.ski'],
      },
      {
        kind: 'skin',
        raw: '利齿绿萼二级.ski',
        candidates: ['models/foo/利齿绿萼二级.ski'],
      },
      {
        kind: 'animation',
        raw: 'tcks_花苞食人花',
        candidates: [],
        dirCandidates: ['models/foo/tcks_花苞食人花'],
        dirExt: '.stck',
      },
    ]);
  });

  it('handles absolute skin paths via resolvePath', () => {
    const wasm = makeWasm({ skinPaths: ['models\\other\\foo.ski'] });
    const refs = smdExtractor.extract(new Uint8Array(0), 'models/foo/bar.smd', wasm);
    expect(refs[0].candidates).toEqual(['models/other/foo.ski']);
  });

  it('emits no animation ref when tcksDir is absent', () => {
    const wasm = makeWasm({ skeletonPath: 'a.bon' });
    const refs = smdExtractor.extract(new Uint8Array(0), 'a.smd', wasm);
    expect(refs.find((r) => r.kind === 'animation')).toBeUndefined();
  });

  it('skips empty skin paths', () => {
    const wasm = makeWasm({ skinPaths: ['', 'real.ski', ''] });
    const refs = smdExtractor.extract(new Uint8Array(0), 'a.smd', wasm);
    expect(refs.filter((r) => r.kind === 'skin')).toHaveLength(1);
  });
});
