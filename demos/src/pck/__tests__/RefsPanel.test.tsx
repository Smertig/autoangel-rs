// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

afterEach(cleanup);
import { RefsPanel } from '../components/RefsPanel';
import type { Edge } from '../index/types';

const e = (over: Partial<Edge> = {}): Edge => ({
  fromPkgId: 1,
  fromPath: 'a.ecm',
  fromName: 'ecm',
  kind: 'skin-model',
  raw: 'a.smd',
  candidates: ['a.smd'],
  resolved: 'a.smd',
  ...over,
});

describe('RefsPanel', () => {
  it('renders the placeholder when no file is selected', () => {
    render(<RefsPanel outgoing={[]} incoming={[]} onNavigate={() => {}} />);
    expect(screen.getByText(/Select a file/i)).toBeDefined();
  });

  it('renders Outgoing and Used by section headers when a file is selected', () => {
    render(
      <RefsPanel
        outgoing={[]}
        incoming={[]}
        onNavigate={() => {}}
        selectedPath="x.ecm"
      />,
    );
    expect(screen.getByText('Outgoing')).toBeDefined();
    expect(screen.getByText('Used by')).toBeDefined();
  });

  it('groups outgoing refs by kind', () => {
    render(
      <RefsPanel
        outgoing={[
          e({ kind: 'skin-model' }),
          e({ kind: 'texture', resolved: 't.dds' }),
        ]}
        incoming={[]}
        onNavigate={() => {}}
        selectedPath="x.ecm"
      />,
    );
    expect(screen.getByText('skin-model')).toBeDefined();
    expect(screen.getByText('texture')).toBeDefined();
  });

  it('renders dangling refs distinctly', () => {
    render(
      <RefsPanel
        outgoing={[e({ kind: 'gfx', raw: 'gfx\\foo.gfx', resolved: null })]}
        incoming={[]}
        onNavigate={() => {}}
        selectedPath="x.ecm"
      />,
    );
    const broken = screen.getByText('gfx\\foo.gfx');
    expect(broken.getAttribute('data-resolved')).toBe('false');
  });

  it('clicking a resolved row calls onNavigate with the resolved path', () => {
    const onNavigate = vi.fn();
    render(
      <RefsPanel
        outgoing={[e({ resolved: 'a.smd' })]}
        incoming={[]}
        onNavigate={onNavigate}
        selectedPath="x.ecm"
      />,
    );
    fireEvent.click(screen.getByText('a.smd'));
    expect(onNavigate).toHaveBeenCalledWith('a.smd');
  });

  it('clicking an incoming row calls onNavigate with fromPath', () => {
    const onNavigate = vi.fn();
    render(
      <RefsPanel
        outgoing={[]}
        incoming={[e({ fromPath: 'parent.ecm' })]}
        onNavigate={onNavigate}
        selectedPath="x.ecm"
      />,
    );
    fireEvent.click(screen.getByText('parent.ecm'));
    expect(onNavigate).toHaveBeenCalledWith('parent.ecm');
  });

  it('shows in/out counts in the rail header', () => {
    render(
      <RefsPanel
        outgoing={[e(), e()]}
        incoming={[e({ fromPath: 'p.ecm' })]}
        onNavigate={() => {}}
        selectedPath="x.ecm"
      />,
    );
    // counts render together: ↗ 2 · ↙ 1
    expect(screen.getByText(/2/)).toBeDefined();
    expect(screen.getByText(/1/)).toBeDefined();
  });
});
