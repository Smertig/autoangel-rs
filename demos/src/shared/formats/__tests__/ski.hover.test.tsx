// @vitest-environment jsdom
import { vi } from 'vitest';

vi.mock('@shared/components/model-viewer/internal/render-ski-hover', () => ({
  renderSkiHoverPreview: vi.fn(),
}));

import { renderSkiHoverPreview } from '@shared/components/model-viewer/internal/render-ski-hover';
import { skiFormat } from '../ski';
import { makeHoverPreviewSmokeTests } from './_hover-preview-smoke';

makeHoverPreviewSmokeTests({ format: skiFormat, renderHelper: vi.mocked(renderSkiHoverPreview) });
