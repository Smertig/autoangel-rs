// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HoverPopover } from '../HoverPopover';

afterEach(cleanup);

const triggerRect = { left: 100, right: 180, top: 50, bottom: 70 };

describe('HoverPopover', () => {
  it('renders metadata strip with basename, dir, ext label, and size', () => {
    render(
      <HoverPopover
        path="textures/foo/bar.dds"
        size={1024 * 200}
        triggerRect={triggerRect}
      >
        <div>body</div>
      </HoverPopover>,
    );
    expect(screen.getByText('bar.dds')).toBeDefined();
    expect(screen.getByText('textures/foo/')).toBeDefined();
    expect(screen.getByText(/DDS · 200\.0 KB/)).toBeDefined();
  });

  it('renders body content', () => {
    render(
      <HoverPopover path="a.txt" size={null} triggerRect={triggerRect}>
        <div>hello-body</div>
      </HoverPopover>,
    );
    expect(screen.getByText('hello-body')).toBeDefined();
  });

  it('omits size when unknown', () => {
    render(
      <HoverPopover path="a.txt" size={null} triggerRect={triggerRect}>
        <div />
      </HoverPopover>,
    );
    expect(screen.getByText(/^TXT$/)).toBeDefined();
  });
});
