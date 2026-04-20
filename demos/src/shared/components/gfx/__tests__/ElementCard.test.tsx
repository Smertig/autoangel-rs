// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ElementCard } from '../ElementCard';

afterEach(cleanup);

const lightElement: any = {
  type_id: 130,
  name: 'torchlight',
  tex_file: '',
  src_blend: 5,
  dest_blend: 6,
  tex_row: 1,
  tex_col: 1,
  repeat_count: 0,
  priority: 0,
  is_dummy: false,
  body: {
    kind: 'light', light_type: 3,
    diffuse: 0xFFE8C16A, specular: 0xFF8A6030, ambient: 0xFF302010,
    position: [0, 1.5, 0], direction: [0, -1, 0],
    range: 15, falloff: 1,
    attenuation0: 0, attenuation1: 0.1, attenuation2: 0,
    theta: 0.52, phi: 0.78,
    inner_use: true, tail_lines: [],
  },
};
const ctx: any = { path: '', ext: '.gfx', getData: async () => new Uint8Array(), wasm: {} };

describe('ElementCard', () => {
  it('renders collapsed with kind badge + name, no expanded block', () => {
    render(<ElementCard element={lightElement} context={ctx} />);
    expect(screen.getByText('LIGHT')).toBeDefined();
    expect(screen.getByText('torchlight')).toBeDefined();
    expect(screen.queryAllByTestId('swatch-fill').length).toBe(0);
  });
  it('expands on click and shows the LightPreview', () => {
    render(<ElementCard element={lightElement} context={ctx} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByTestId('swatch-fill').length).toBe(3);
  });
  it('exposes aria-expanded correctly', () => {
    render(<ElementCard element={lightElement} context={ctx} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
  it('renders <unnamed> when name is empty', () => {
    const el = { ...lightElement, name: '' };
    render(<ElementCard element={el} context={ctx} />);
    expect(screen.getByText(/unnamed/)).toBeDefined();
  });
});
