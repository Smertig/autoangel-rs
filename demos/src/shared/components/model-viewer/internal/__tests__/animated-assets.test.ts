import { describe, it, expect, vi } from 'vitest';
import { pickDefaultClip } from '../animated-assets';

vi.mock('@shared/util/model-dependencies', () => ({
  discoverStckPaths: vi.fn(() => []),
}));

const fakeAnimation = { anim_start: 0, anim_end: 100, anim_fps: 10, bone_tracks: [] };
const sampleActions = [
  { name: 'walk', start_frame: 0, end_frame: 50, frame_rate: null, tck_file: null },
  { name: '站立', start_frame: 51, end_frame: 100, frame_rate: null, tck_file: null },
];

describe('pickDefaultClip', () => {
  it('chooses embedded mode when SMD has actions without tck_file and BON has embedded_animation', () => {
    const result = pickDefaultClip({
      smdPath: 'foo.smd',
      smdTcksDir: undefined,
      smdActions: sampleActions as any,
      embeddedAnimation: fakeAnimation as any,
      pkg: {} as any,
    });
    expect(result.kind).toBe('embedded');
    if (result.kind !== 'embedded') return;
    expect(result.animNames).toEqual(['walk', '站立']);
    expect(result.defaultClipName).toBe('站立'); // PREFERRED_ANIM_HINT match (站立 = "standing")
    expect(result.defaultAction?.name).toBe('站立');
  });

  it('falls back to none when embedded animation absent and no STCKs discoverable', () => {
    const result = pickDefaultClip({
      smdPath: 'foo.smd',
      smdTcksDir: undefined,
      smdActions: [],
      embeddedAnimation: null,
      pkg: {} as any,
    });
    expect(result.kind).toBe('none');
  });

  it('does NOT use embedded mode when an action carries a tck_file (SMD v>=7)', () => {
    const result = pickDefaultClip({
      smdPath: 'foo.smd',
      smdTcksDir: undefined,
      smdActions: [{ ...sampleActions[0], tck_file: 'walk.stck' }] as any,
      embeddedAnimation: fakeAnimation as any,
      pkg: {} as any,
    });
    expect(result.kind).toBe('none');
  });
});
