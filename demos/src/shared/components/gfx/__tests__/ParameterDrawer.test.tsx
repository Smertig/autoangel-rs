// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ParameterDrawer } from '../ParameterDrawer';

afterEach(cleanup);

function makeParticleElement(name = 'p1'): any {
  return {
    name,
    tex_file: '', tex_row: 1, tex_col: 1, src_blend: 5, dest_blend: 6,
    body: {
      kind: 'particle', quota: 7,
      particle_width: 1, particle_height: 1, three_d_particle: false, facing: 0,
      emitter: {
        emission_rate: 1, ttl: 1, angle: 0, speed: 0,
        is_bind: false, is_surface: false,
        color_min: 0, color_max: 0,
        scale_min: 1, scale_max: 1,
        acc: 0, acc_dir: [0, 1, 0],
      },
    },
  };
}

const ctx: any = { findFile: () => null };

describe('ParameterDrawer', () => {
  it('renders nothing when element is null', () => {
    const { container } = render(
      <ParameterDrawer element={null} context={ctx} onClose={() => {}} />);
    expect(container.querySelector('[data-testid=drawer]')).toBeNull();
  });

  it('renders FieldPanel rows for the given element', () => {
    render(<ParameterDrawer element={makeParticleElement()}
      context={ctx} onClose={() => {}} />);
    expect(screen.getByTestId('drawer')).toBeTruthy();
    expect(screen.getByText('quota')).toBeTruthy();
    expect(screen.getByText('p1')).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ParameterDrawer element={makeParticleElement()} context={ctx} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<ParameterDrawer element={makeParticleElement()} context={ctx} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not respond to Escape when element is null (listener removed)', () => {
    const onClose = vi.fn();
    render(<ParameterDrawer element={null} context={ctx} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
