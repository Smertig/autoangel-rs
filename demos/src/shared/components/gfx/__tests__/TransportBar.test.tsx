// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TransportBar } from '../TransportBar';

afterEach(cleanup);

const baseProps = {
  playing: true,
  onPlayToggle: () => {},
  onRestart: () => {},
  currentSec: 0,
  totalSec: 4,
  speed: 1,
  onSpeedChange: () => {},
  loopPulse: false,
};

describe('TransportBar', () => {
  it('shows current/total when finite', () => {
    render(<TransportBar {...baseProps} currentSec={1} totalSec={4} />);
    expect(screen.getByText(/1\.00s \/ 4\.00s/)).toBeTruthy();
  });

  it('shows time + ∞ when total is infinite', () => {
    render(<TransportBar {...baseProps} currentSec={1.234} totalSec={Infinity} />);
    expect(screen.getByText(/1\.23s/)).toBeTruthy();
    expect(screen.getByText(/∞/)).toBeTruthy();
  });

  it('renders pause icon when playing, play icon when paused', () => {
    const { rerender } = render(<TransportBar {...baseProps} playing />);
    expect(screen.getByTitle('Pause (space)')).toBeTruthy();
    rerender(<TransportBar {...baseProps} playing={false} />);
    expect(screen.getByTitle('Play (space)')).toBeTruthy();
  });

  it('fires play and restart callbacks via buttons', () => {
    const onPlayToggle = vi.fn(); const onRestart = vi.fn();
    render(<TransportBar {...baseProps} onPlayToggle={onPlayToggle} onRestart={onRestart} />);
    fireEvent.click(screen.getByTitle('Pause (space)'));
    fireEvent.click(screen.getByTitle('Restart (R)'));
    expect(onPlayToggle).toHaveBeenCalledOnce();
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('spacebar toggles play/pause', () => {
    const onPlayToggle = vi.fn();
    render(<TransportBar {...baseProps} onPlayToggle={onPlayToggle} />);
    fireEvent.keyDown(document, { key: ' ' });
    expect(onPlayToggle).toHaveBeenCalledOnce();
  });

  it('R key triggers restart', () => {
    const onRestart = vi.fn();
    render(<TransportBar {...baseProps} onRestart={onRestart} />);
    fireEvent.keyDown(document, { key: 'r' });
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('ignores spacebar when focus is inside an input', () => {
    const onPlayToggle = vi.fn();
    const wrapper = document.createElement('input');
    document.body.appendChild(wrapper);
    wrapper.focus();
    render(<TransportBar {...baseProps} onPlayToggle={onPlayToggle} />);
    fireEvent.keyDown(wrapper, { key: ' ' });
    expect(onPlayToggle).not.toHaveBeenCalled();
    document.body.removeChild(wrapper);
  });

  it('renders the speed slider with the current value', () => {
    render(<TransportBar {...baseProps} speed={2} />);
    expect(screen.getByText(/2\.0×/)).toBeTruthy();
  });

  it('flashes loop indicator when loopPulse is true', () => {
    const { rerender } = render(<TransportBar {...baseProps} loopPulse={false} />);
    const dot = screen.getByTestId('loop-pulse');
    expect(dot.getAttribute('data-pulsing')).toBe('false');
    rerender(<TransportBar {...baseProps} loopPulse={true} />);
    expect(screen.getByTestId('loop-pulse').getAttribute('data-pulsing')).toBe('true');
  });
});
