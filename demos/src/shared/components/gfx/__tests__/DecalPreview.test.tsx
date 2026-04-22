// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DecalPreview } from '../previews/decal/DecalPreview';

afterEach(cleanup);

const baseBody: any = {
  kind: 'decal',
  width: 1,
  height: 1,
  rot_from_view: false,
};
const ctx: any = {
  path: '',
  ext: '.gfx',
  getData: async () => new Uint8Array(),
  listFiles: () => [],
  findFile: () => null,
  wasm: {},
};

function makeElement(typeId: 100 | 101 | 102, kps: any = undefined) {
  return {
    type_id: typeId,
    name: 'D1',
    src_blend: 5,
    dest_blend: 6,
    repeat_count: 0,
    repeat_delay: 0,
    tex_file: '',
    tex_row: 1,
    tex_col: 1,
    tex_interval: 0,
    tile_mode: 0,
    z_enable: 0,
    is_dummy: 0,
    priority: 0,
    affectors: [],
    key_point_set: kps,
  };
}

describe('DecalPreview', () => {
  it('renders the 2D canvas for type 101 (Decal2D)', () => {
    render(
      <DecalPreview
        body={baseBody}
        element={makeElement(101) as any}
        context={ctx}
        expanded={true}
      />,
    );
    expect(screen.getByTestId('decal-2d-canvas')).toBeTruthy();
    expect(screen.queryByTestId('decal-3d-canvas')).toBeNull();
  });

  it('renders the 3D canvas mount for type 100 (Decal3D)', () => {
    render(
      <DecalPreview
        body={baseBody}
        element={makeElement(100) as any}
        context={ctx}
        expanded={true}
      />,
    );
    expect(screen.getByTestId('decal-3d-canvas')).toBeTruthy();
    expect(screen.queryByTestId('decal-2d-canvas')).toBeNull();
  });

  it('renders the 3D canvas mount for type 102 (DecalBillboard)', () => {
    render(
      <DecalPreview
        body={baseBody}
        element={makeElement(102) as any}
        context={ctx}
        expanded={true}
      />,
    );
    expect(screen.getByTestId('decal-3d-canvas')).toBeTruthy();
  });

  it('shows KPS metadata rows when key_point_set is present', () => {
    const kps = {
      start_time: 250,
      keypoints: [
        {
          interpolate_mode: 1,
          time_span: 200,
          position: [0, 0, 0],
          color: 0xffff0000,
          scale: 1,
          direction: [0, 0, 0, 1],
          rad_2d: 0,
          controllers: [],
        },
        {
          interpolate_mode: 1,
          time_span: 100,
          position: [0, 0, 0],
          color: 0xff00ff00,
          scale: 1,
          direction: [0, 0, 0, 1],
          rad_2d: 0,
          controllers: [],
        },
      ],
    };
    render(
      <DecalPreview
        body={baseBody}
        element={makeElement(101, kps) as any}
        context={ctx}
        expanded={true}
      />,
    );
    expect(screen.getByText('kp_start')).toBeTruthy();
    expect(screen.getByText('kp_count')).toBeTruthy();
    expect(screen.getByText('kp_duration')).toBeTruthy();
  });

  it('surfaces unhandled controller kinds in a field row', () => {
    const kps = {
      start_time: 0,
      keypoints: [
        {
          interpolate_mode: 1,
          time_span: 100,
          position: [0, 0, 0],
          color: 0xffffffff,
          scale: 1,
          direction: [0, 0, 0, 1],
          rad_2d: 0,
          controllers: [
            {
              start_time: 0,
              end_time: -1,
              body: { kind: 'curve_move', calc_dir: false, vertices: [[0, 0, 0]] },
            },
          ],
        },
        {
          interpolate_mode: 1,
          time_span: 100,
          position: [0, 0, 0],
          color: 0xffffffff,
          scale: 1,
          direction: [0, 0, 0, 1],
          rad_2d: 0,
          controllers: [],
        },
      ],
    };
    render(
      <DecalPreview
        body={baseBody}
        element={makeElement(101, kps) as any}
        context={ctx}
        expanded={true}
      />,
    );
    expect(screen.getByText('unhandled_ctrls')).toBeTruthy();
    expect(screen.getByText(/curve_move/)).toBeTruthy();
  });

  it('returns thumbnail when not expanded', () => {
    const { container } = render(
      <DecalPreview
        body={baseBody}
        element={makeElement(101) as any}
        context={ctx}
        expanded={false}
      />,
    );
    expect(container.querySelector('[data-testid="decal-thumb"]')).toBeTruthy();
    expect(screen.queryByTestId('decal-2d-canvas')).toBeNull();
  });
});
