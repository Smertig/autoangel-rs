// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonoNum, Vec3, ColorSwatch, BoolDot, PathOrText, MonoJson } from '../formatters';

describe('MonoNum', () => {
  it('renders integer without decimal', () => {
    render(<MonoNum value={42} />);
    expect(screen.getByText('42')).toBeDefined();
  });
  it('renders float with up to 3 decimals', () => {
    render(<MonoNum value={1.23456} />);
    expect(screen.getByText('1.235')).toBeDefined();
  });
  it('groups thousands with thin space >= 10000', () => {
    const { container } = render(<MonoNum value={12345} />);
    // Match raw textContent — @testing-library/dom's default normalizer would
    // collapse U+202F to a regular space, defeating the assertion.
    expect(container.textContent).toBe('12\u202F345');
  });
});

describe('Vec3', () => {
  it('renders three cells with aligned values', () => {
    const { container } = render(<Vec3 value={[1, -2.5, 0.1]} />);
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('−2.5');
    expect(container.textContent).toContain('0.1');
  });
});

describe('ColorSwatch', () => {
  it('renders swatch + hex label', () => {
    render(<ColorSwatch argb={0xFFFF8040} />);
    expect(screen.getByText('0xFFFF8040')).toBeDefined();
    expect(screen.getByTestId('swatch-fill')).toBeDefined();
  });
});

describe('BoolDot', () => {
  it('renders filled dot + "on" when true', () => {
    render(<BoolDot on={true} />);
    expect(screen.getByText('on')).toBeDefined();
  });
  it('renders hollow dot + "off" when false', () => {
    render(<BoolDot on={false} />);
    expect(screen.getByText('off')).toBeDefined();
  });
});

describe('PathOrText', () => {
  it('renders plain text when findFile returns null', () => {
    render(<PathOrText value="foo.dds" findFile={() => null} />);
    expect(screen.getByText('foo.dds')).toBeDefined();
  });
  it('renders plain text when resolvable but no onNavigate is provided', () => {
    // Decorative arrow was dropped — a resolvable path with no navigate
    // handler has nothing to offer the user, so it degrades to plain text.
    const { container } = render(
      <PathOrText value="foo.dds" findFile={(p) => p === 'foo.dds' ? 'foo.dds' : null} />
    );
    expect(container.textContent).toBe('foo.dds');
    expect(container.querySelector('button')).toBeNull();
  });
  it('renders an open button and fires onNavigate with the canonical path when resolvable + navigable', () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <PathOrText
        value="foo.dds"
        findFile={(p) => p === 'foo.dds' ? 'Foo.DDS' : null}
        onNavigate={onNavigate}
      />
    );
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(onNavigate).toHaveBeenCalledWith('Foo.DDS');
  });
  it('stays non-clickable when onNavigate is provided but the path does not resolve', () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <PathOrText value="foo.dds" findFile={() => null} onNavigate={onNavigate} />
    );
    expect(container.querySelector('button')).toBeNull();
  });
  it('stops event propagation on click so the host (e.g. tick hover) does not re-trigger', () => {
    const parentClick = vi.fn();
    const onNavigate = vi.fn();
    const { container } = render(
      <div onClick={parentClick}>
        <PathOrText
          value="foo.dds"
          findFile={() => 'foo.dds'}
          onNavigate={onNavigate}
        />
      </div>
    );
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(onNavigate).toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe('MonoJson', () => {
  it('renders single-line JSON', () => {
    render(<MonoJson value={{ a: 1, b: [true, false] }} />);
    expect(screen.getByText('{"a":1,"b":[true,false]}')).toBeDefined();
  });
});
