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
  tail_lines: [],
};
const element: any = { type_id: 130, name: 'L1' };
const ctx: any = { path: '', ext: '.gfx', getData: async () => new Uint8Array(), wasm: {} };

describe('LightPreview', () => {
  it('renders three color swatches for diffuse/specular/ambient', () => {
    render(<LightPreview body={body} element={element} context={ctx} expanded={true} />);
    expect(screen.getAllByTestId('swatch-fill').length).toBe(3);
  });
  it('renders range + falloff + theta + phi in both the summary and FieldPanel', () => {
    render(<LightPreview body={body} element={element} context={ctx} expanded={true} />);
    // These scalars appear TWICE by design — once as a ScalarCell in the
    // left-column summary, once as a FieldPanel row in the right column
    // ("field photo + full taxonomy" per the design doc). Both DOM nodes
    // should be present for each label.
    expect(screen.getAllByText('range').length).toBe(2);
    expect(screen.getAllByText('theta').length).toBe(2);
    expect(screen.getAllByText('falloff').length).toBe(2);
    expect(screen.getAllByText('phi').length).toBe(2);
  });
});
