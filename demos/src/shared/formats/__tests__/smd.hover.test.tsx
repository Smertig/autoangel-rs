// @vitest-environment jsdom
import { vi } from 'vitest';

vi.mock('@shared/components/model-viewer/internal/render-smd-hover', () => ({
  renderSmdHoverPreview: vi.fn(),
}));

import { renderSmdHoverPreview } from '@shared/components/model-viewer/internal/render-smd-hover';
import { smdFormat } from '../smd';
import { makeHoverPreviewSmokeTests } from './_hover-preview-smoke';

makeHoverPreviewSmokeTests({ format: smdFormat, renderHelper: vi.mocked(renderSmdHoverPreview) });
