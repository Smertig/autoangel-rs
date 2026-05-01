// @vitest-environment jsdom
import { vi } from 'vitest';

vi.mock('@shared/components/gfx/render-hover', () => ({
  renderGfxHoverPreview: vi.fn(),
}));

import { renderGfxHoverPreview } from '@shared/components/gfx/render-hover';
import { gfxFormat } from '../gfx';
import { makeHoverPreviewSmokeTests } from './_hover-preview-smoke';

makeHoverPreviewSmokeTests({ format: gfxFormat, renderHelper: vi.mocked(renderGfxHoverPreview) });
