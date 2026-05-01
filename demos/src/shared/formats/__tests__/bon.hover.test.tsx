// @vitest-environment jsdom
import { vi } from 'vitest';

vi.mock('@shared/components/model-viewer/internal/render-bon-hover', () => ({
  renderBonHoverPreview: vi.fn(),
}));

import { renderBonHoverPreview } from '@shared/components/model-viewer/internal/render-bon-hover';
import { bonFormat } from '../bon';
import { makeHoverPreviewSmokeTests } from './_hover-preview-smoke';

makeHoverPreviewSmokeTests({ format: bonFormat, renderHelper: vi.mocked(renderBonHoverPreview) });
