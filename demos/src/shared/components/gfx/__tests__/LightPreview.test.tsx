// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LightPreview } from '../previews/LightPreview';

afterEach(cleanup);

const body: any = {
  kind: 'light',
  light_type: 3,
  diffuse: 0xFFE8C16A,
  specular: 0xFF8A6030,
  ambient: 0xFF302010,
  position: [0, 1.5, 0],
  direction: [0, -1, 0],
  range: 15,
  falloff: 1,
  attenuation0: 0,
  attenuation1: 0.1,
  attenuation2: 0,
  theta: 0.52,
  phi: 0.78,
  inner_use: true,
};

function makeElement(kps: any = undefined) {
  return { type_id: 130, name: 'L1', affectors: [], key_point_set: kps };
}
const ctx: any = { path: '', ext: '.gfx', getData: async () => new Uint8Array(), wasm: {} };

describe('LightPreview', () => {
  it('renders three color swatches for diffuse/specular/ambient', () => {
    render(<LightPreview body={body} element={makeElement() as any} context={ctx} expanded={true} />);
    expect(screen.getAllByTestId('big-swatch').length).toBe(3);
  });

  it('renders range + falloff + theta + phi in both the summary and FieldPanel', () => {
    render(<LightPreview body={body} element={makeElement() as any} context={ctx} expanded={true} />);
    // Each scalar appears twice — left-column ScalarCell + right-column FieldPanel row.
    expect(screen.getAllByText('range').length).toBe(2);
    expect(screen.getAllByText('theta').length).toBe(2);
    expect(screen.getAllByText('falloff').length).toBe(2);
    expect(screen.getAllByText('phi').length).toBe(2);
  });

  it('omits the keypoint timeline when the element has no KeyPointSet', () => {
    render(<LightPreview body={body} element={makeElement(undefined) as any} context={ctx} expanded={true} />);
    expect(screen.queryByTestId('kp-timeline')).toBeNull();
    expect(screen.queryByText('kp_count')).toBeNull();
  });

  it('renders timeline + metadata when the element has a multi-keypoint animation', () => {
    const kps = {
      start_time: 500,
      keypoints: [
        makeKeyPoint({ time_span: 400, color: 0xFFFF0000 }),
        makeKeyPoint({ time_span: 200, color: 0xFF00FF00 }),
        makeKeyPoint({ time_span: 100, color: 0xFF0000FF }),
      ],
    };
    render(<LightPreview body={body} element={makeElement(kps) as any} context={ctx} expanded={true} />);
    expect(screen.getByTestId('kp-timeline')).toBeTruthy();
    // Metadata rows
    expect(screen.getByText('kp_start')).toBeTruthy();
    expect(screen.getByText('kp_count')).toBeTruthy();
    expect(screen.getByText('kp_duration')).toBeTruthy();
    // The first diffuse swatch is flagged as animated.
    const swatches = screen.getAllByTestId('big-swatch');
    expect(swatches[0].getAttribute('data-animated')).toBe('true');
  });

  it('treats a single-keypoint track as static (no animation flag, still shows metadata)', () => {
    const kps = {
      start_time: 0,
      keypoints: [makeKeyPoint({ time_span: -1, color: 0xFFAABBCC })],
    };
    render(<LightPreview body={body} element={makeElement(kps) as any} context={ctx} expanded={true} />);
    const swatches = screen.getAllByTestId('big-swatch');
    expect(swatches[0].getAttribute('data-animated')).toBeNull();
    expect(screen.getByText('kp_count')).toBeTruthy();
    expect(screen.getByText('∞ (hold)')).toBeTruthy();
  });
});

function makeKeyPoint(overrides: Partial<{ time_span: number; color: number }>) {
  return {
    interpolate_mode: 1,
    time_span: 0,
    position: [0, 0, 0],
    color: 0xFFFFFFFF,
    scale: 1,
    direction: [0, 0, 0, 1],
    rad_2d: 0,
    controllers: [],
    ...overrides,
  };
}
