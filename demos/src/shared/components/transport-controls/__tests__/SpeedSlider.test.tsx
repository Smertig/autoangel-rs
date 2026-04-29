// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpeedSlider } from '../SpeedSlider';

afterEach(cleanup);

describe('SpeedSlider', () => {
  it('renders the current speed label', () => {
    render(<SpeedSlider value={1} onChange={() => {}} />);
    expect(screen.getByText(/1\.0×/)).toBeTruthy();
  });

  it('calls onChange when wheel scrolls up', () => {
    const onChange = vi.fn();
    render(<SpeedSlider value={1} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.wheel(slider, { deltaY: -100 });
    // 1× × √2 ≈ 1.414 → not within snap tolerance of 2× → returned as-is.
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toBeGreaterThan(1);
  });

  it('resets to 1× on double-click', () => {
    const onChange = vi.fn();
    render(<SpeedSlider value={2} onChange={onChange} />);
    fireEvent.doubleClick(screen.getByRole('slider'));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
