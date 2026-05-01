// @vitest-environment jsdom
import { vi } from 'vitest';

vi.mock('@shared/components/model-viewer/internal/render-ecm-hover', () => ({
  renderEcmHoverPreview: vi.fn(),
}));

import { renderEcmHoverPreview } from '@shared/components/model-viewer/internal/render-ecm-hover';
import { ecmFormat } from '../ecm';
import { makeHoverPreviewSmokeTests } from './_hover-preview-smoke';

makeHoverPreviewSmokeTests({ format: ecmFormat, renderHelper: vi.mocked(renderEcmHoverPreview) });
