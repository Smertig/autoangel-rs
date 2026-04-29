import type { FieldRow } from '../fieldPanel';
import { BoolDot, ColorSwatch, MonoNum, Vec3 } from '../formatters';
import { buildTrack } from '../util/keypointTrack';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';
import styles from './light.module.css';

type LightBody = Extract<ElementBody, { kind: 'light' }>;

export function buildLightRows(
  body: LightBody,
  element: GfxElement,
  _ctx: ViewerCtx,
): FieldRow[] {
  const track = buildTrack(element.key_point_set);

  const rows: FieldRow[] = [
    { label: 'type', value: <MonoNum value={body.light_type} /> },
    { label: 'inner_use', value: <BoolDot on={!!body.inner_use} /> },
    { divider: true },
    { label: 'diffuse', value: <ColorSwatch argb={body.diffuse} /> },
    { label: 'specular', value: <ColorSwatch argb={body.specular} /> },
    { label: 'ambient', value: <ColorSwatch argb={body.ambient} /> },
    { divider: true },
    { label: 'position', value: <Vec3 value={body.position} /> },
    { label: 'direction', value: <Vec3 value={body.direction} /> },
    { divider: true },
    { label: 'range', value: <MonoNum value={body.range} /> },
    { label: 'falloff', value: <MonoNum value={body.falloff} /> },
    { label: 'theta', value: <MonoNum value={body.theta} /> },
    { label: 'phi', value: <MonoNum value={body.phi} /> },
    { label: 'attenuation', value: <Vec3 value={[body.attenuation0, body.attenuation1, body.attenuation2]} /> },
  ];
  if (track.colors.length > 0) {
    rows.push({ divider: true });
    rows.push({ label: 'kp_start', value: <MonoNum value={track.startTimeMs} /> });
    rows.push({ label: 'kp_count', value: <MonoNum value={track.colors.length} /> });
    rows.push({
      label: 'kp_duration',
      value: track.loopable
        ? <MonoNum value={track.loopDurationMs} />
        : <span className={styles.holdForever}>∞ (hold)</span>,
    });
  }

  return rows;
}
