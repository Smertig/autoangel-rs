// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldPanel } from '../fieldPanel';

describe('FieldPanel', () => {
  it('renders rows with label + value', () => {
    render(
      <FieldPanel rows={[
        { label: 'range', value: <span>15.0</span> },
        { label: 'falloff', value: <span>1.0</span> },
      ]} />,
    );
    expect(screen.getByText('range')).toBeDefined();
    expect(screen.getByText('15.0')).toBeDefined();
  });
  it('renders a section rule between groups', () => {
    const { container } = render(
      <FieldPanel rows={[
        { label: 'a', value: <span>1</span> },
        { divider: true },
        { label: 'b', value: <span>2</span> },
      ]} />,
    );
    const dividers = container.querySelectorAll('[data-testid="panel-divider"]');
    expect(dividers.length).toBe(1);
  });
});
