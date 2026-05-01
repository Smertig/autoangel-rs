// @vitest-environment jsdom
import { vi } from 'vitest';

vi.mock('@shared/components/model-viewer/internal/render-bmd-hover', () => ({
  renderBmdHoverPreview: vi.fn(),
}));

import { renderBmdHoverPreview } from '@shared/components/model-viewer/internal/render-bmd-hover';
import { bmdFormat } from '../bmd';
import { makeHoverPreviewSmokeTests } from './_hover-preview-smoke';

makeHoverPreviewSmokeTests({ format: bmdFormat, renderHelper: vi.mocked(renderBmdHoverPreview) });
