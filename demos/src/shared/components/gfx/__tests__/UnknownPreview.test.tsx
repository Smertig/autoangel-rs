// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnknownPreview } from '../previews/UnknownPreview';

describe('UnknownPreview', () => {
  it('renders tail_lines in the preview', () => {
    render(<UnknownPreview
      body={{ kind: 'unknown', lines: ['Foo=1', 'Bar=2'] } as any}
      element={{ type_id: 999, name: 'x' } as any}
      context={{ path: '', ext: '.gfx', getData: async () => new Uint8Array(), wasm: {} } as any}
      expanded={true}
    />);
    expect(screen.getByText(/Foo=1/)).toBeDefined();
    expect(screen.getByText(/Bar=2/)).toBeDefined();
  });
});
