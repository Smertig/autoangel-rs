import { useDecal3DCanvas } from './useDecal3DCanvas';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';
import type { Track } from '../../util/keypointTrack';

type DecalBody = Extract<ElementBody, { kind: 'decal' }>;

export function Decal3DScene(props: {
  body: DecalBody;
  element: GfxElement;
  context: ViewerCtx;
  track: Track;
}) {
  const { canvasRef } = useDecal3DCanvas(
    props.body,
    props.element,
    props.context,
    props.track,
  );
  return (
    <div
      ref={canvasRef}
      data-testid="decal-3d-canvas"
      style={{ minHeight: 200, width: '100%' }}
    />
  );
}
