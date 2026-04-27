// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ChangelogButton } from '../ChangelogButton';
import { LAST_SEEN_KEY, readLastSeen, type ChangelogEntry } from '../../changelog';

const ENTRIES: ChangelogEntry[] = [
  { id: 'a', date: '2026-04-01', scope: 'pck', title: 'pck change' },
  { id: 'b', date: '2026-03-01', scope: 'elements', title: 'elements change' },
];

afterEach(cleanup);

describe('ChangelogButton', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not show a dot on first visit (silent init)', () => {
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    const dot = document.querySelector('[data-testid="changelog-dot"]');
    expect(dot).toBeNull();
  });

  it('shows a dot when there is an unseen entry in scope', () => {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({}));
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    expect(document.querySelector('[data-testid="changelog-dot"]')).not.toBeNull();
  });

  it('does not show a dot for a scope with no relevant entries', () => {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({}));
    render(<ChangelogButton scope="pck-diff" entries={ENTRIES} />);
    expect(document.querySelector('[data-testid="changelog-dot"]')).toBeNull();
  });
});

describe('ChangelogButton panel', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({}));
  });

  it('opens panel on trigger click and shows scoped entries', () => {
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    expect(screen.getByText('pck change')).toBeDefined();
    expect(screen.queryByText('elements change')).toBeNull();
  });

  it('closes panel when trigger clicked again', () => {
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    const btn = screen.getByRole('button', { name: /what'?s new/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByText('pck change')).toBeNull();
  });

  it('marks current scope and shared as seen when opened', () => {
    const ENTRIES2: ChangelogEntry[] = [
      ...ENTRIES,
      { id: 's', date: '2026-02-01', scope: 'shared', title: 's' },
    ];
    render(<ChangelogButton scope="pck" entries={ENTRIES2} />);
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    const last = readLastSeen();
    expect(last.pck).toBe('a');
    expect(last.shared).toBe('s');
    expect(last.elements).toBeUndefined();
  });

  it('hides the dot after opening', () => {
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    expect(document.querySelector('[data-testid="changelog-dot"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    expect(document.querySelector('[data-testid="changelog-dot"]')).toBeNull();
  });

  it('"View all" toggle shows entries from every scope', () => {
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    expect(screen.queryByText('elements change')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /view all/i }));
    expect(screen.getByText('elements change')).toBeDefined();
  });

  it('renders a "no updates" empty state when there are no in-scope entries', () => {
    render(<ChangelogButton scope="pck-diff" entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    expect(screen.getByText(/no updates/i)).toBeDefined();
  });
});

describe('ChangelogButton dismiss', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('closes on Escape key', () => {
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on outside click', () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <ChangelogButton scope="pck" entries={ENTRIES} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not close when clicking inside the panel', () => {
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog);
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});

describe('ChangelogButton entry markers', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({}));
  });

  it('marks unseen entries with data-new in the panel', () => {
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    const row = screen.getByText('pck change').closest('[data-new]');
    expect(row).not.toBeNull();
  });

  it('shows scope label only in view-all mode', () => {
    render(<ChangelogButton scope="pck" entries={ENTRIES} />);
    fireEvent.click(screen.getByRole('button', { name: /what'?s new/i }));
    expect(screen.queryByText(/^pck$/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /view all/i }));
    expect(screen.queryAllByText(/^pck$/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/^elements$/).length).toBeGreaterThan(0);
  });
});
