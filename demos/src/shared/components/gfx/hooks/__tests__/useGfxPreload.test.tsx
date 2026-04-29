// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { useGfxPreload } from '../useGfxPreload';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

afterEach(cleanup);

function Probe({ parsed, context, onResult }: any) {
  const result = useGfxPreload(parsed, context);
  if (result.ready) onResult(result);
  return null;
}

describe('useGfxPreload', () => {
  it('reports ready=true with empty maps for a GFX with no nested gfx or textures', async () => {
    let captured: any = null;
    const parsed = { elements: [{ name: 'p', body: { kind: 'particle' }, tex_file: '' }] } as any;
    const context = {
      wasm: { parseGfx: () => ({ elements: [] }) },
      pkg: EMPTY_PACKAGE_VIEW,
    } as any;
    render(<Probe parsed={parsed} context={context} onResult={(r: any) => { captured = r; }} />);
    await waitFor(() => { expect(captured).not.toBeNull(); });
    expect(captured.ready).toBe(true);
    expect(captured.preloadedGfx.size).toBe(0);
  });
});
