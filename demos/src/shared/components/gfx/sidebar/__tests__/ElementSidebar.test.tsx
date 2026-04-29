// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ElementSidebar } from '../ElementSidebar';

afterEach(cleanup);

const tree = [
  { path: [0], element: { name: 'p1', body: { kind: 'particle' } } },
  { path: [1], element: { name: 'l1', body: { kind: 'light' } } }, // unsupported in runtime today
  { path: [2], element: { name: 'box', body: { kind: 'container', gfx_path: 'x' } },
    children: [
      { path: [2, 0], element: { name: 'c1', body: { kind: 'particle' } } },
    ] },
] as any;

const baseProps = {
  enabled: new Set(['0', '1', '2', '2.0']),
  solo: null,
  expanded: new Set<string>(),
  selectedIndex: null,
  isSupported: (k: string) => k === 'particle' || k === 'container',
};

describe('ElementSidebar', () => {
  it('renders top-level rows; children hidden until container expanded', () => {
    render(<ElementSidebar tree={tree} {...baseProps}
      onToggle={() => {}} onSolo={() => {}} onSelect={() => {}}
      onExpandToggle={() => {}} />);
    expect(screen.getByText('p1')).toBeTruthy();
    expect(screen.getByText('l1')).toBeTruthy();
    expect(screen.getByText('box')).toBeTruthy();
    expect(screen.queryByText('c1')).toBeNull();
  });

  it('shows children when the container row is in `expanded`', () => {
    render(<ElementSidebar tree={tree} {...baseProps}
      expanded={new Set(['2'])}
      onToggle={() => {}} onSolo={() => {}} onSelect={() => {}}
      onExpandToggle={() => {}} />);
    expect(screen.getByText('c1')).toBeTruthy();
  });

  it('marks unsupported kinds with data-supported=false', () => {
    render(<ElementSidebar tree={tree} {...baseProps}
      onToggle={() => {}} onSolo={() => {}} onSelect={() => {}}
      onExpandToggle={() => {}} />);
    const lightRow = screen.getByText('l1').closest('[data-row]')!;
    expect(lightRow.getAttribute('data-supported')).toBe('false');
    const particleRow = screen.getByText('p1').closest('[data-row]')!;
    expect(particleRow.getAttribute('data-supported')).toBe('true');
  });

  it('shift-click triggers solo, plain click triggers select', () => {
    const onSolo = vi.fn(); const onSelect = vi.fn();
    render(<ElementSidebar tree={tree}
      enabled={baseProps.enabled} solo={null} expanded={new Set()}
      selectedIndex={null} isSupported={() => true}
      onToggle={() => {}} onSolo={onSolo} onSelect={onSelect}
      onExpandToggle={() => {}} />);
    const row = screen.getByText('p1').closest('[data-row]')! as HTMLElement;
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('0');
    expect(onSolo).not.toHaveBeenCalled();
    fireEvent.click(row, { shiftKey: true });
    expect(onSolo).toHaveBeenCalledWith('0');
  });

  it('toggling the checkbox flips visibility and does not also select', () => {
    const onToggle = vi.fn(); const onSelect = vi.fn();
    render(<ElementSidebar tree={tree}
      enabled={baseProps.enabled} solo={null} expanded={new Set()}
      selectedIndex={null} isSupported={() => true}
      onToggle={onToggle} onSolo={() => {}} onSelect={onSelect}
      onExpandToggle={() => {}} />);
    const cb = screen.getAllByRole('checkbox')[0];
    fireEvent.click(cb);
    expect(onToggle).toHaveBeenCalledWith('0');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('chevron click toggles expansion and does not also select', () => {
    const onExpandToggle = vi.fn(); const onSelect = vi.fn();
    render(<ElementSidebar tree={tree}
      enabled={baseProps.enabled} solo={null} expanded={new Set()}
      selectedIndex={null} isSupported={() => true}
      onToggle={() => {}} onSolo={() => {}} onSelect={onSelect}
      onExpandToggle={onExpandToggle} />);
    // The container row has a chevron button. Find it by role + look for one inside the box row.
    const boxRow = screen.getByText('box').closest('[data-row]')! as HTMLElement;
    const chevron = boxRow.querySelector('button[aria-expanded]') as HTMLButtonElement;
    expect(chevron).not.toBeNull();
    fireEvent.click(chevron);
    expect(onExpandToggle).toHaveBeenCalledWith('2');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
