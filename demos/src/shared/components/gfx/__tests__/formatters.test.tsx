// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  it('renders with arrow when findFile resolves', () => {
    const { container } = render(
      <PathOrText value="foo.dds" findFile={(p) => p === 'foo.dds' ? 'foo.dds' : null} />
    );
    expect(container.textContent).toContain('foo.dds');
    expect(container.textContent).toContain('→');
  });
});

describe('MonoJson', () => {
  it('renders single-line JSON', () => {
    render(<MonoJson value={{ a: 1, b: [true, false] }} />);
    expect(screen.getByText('{"a":1,"b":[true,false]}')).toBeDefined();
  });
});
