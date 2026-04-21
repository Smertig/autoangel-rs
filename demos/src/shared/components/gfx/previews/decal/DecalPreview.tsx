import { useMemo } from 'react';
import { FieldPanel, type FieldRow } from '../../fieldPanel';
import { MonoNum, BoolDot, PathOrText } from '../../formatters';
import { argbToCss } from '../../util/argb';
import { buildTrack } from '../../util/keypointTrack';
import { formatBlendMode } from '../../util/blendModes';
import type { PreviewProps } from '../types';
import { Decal2DCanvas } from './Decal2DCanvas';
import { Decal3DScene } from './Decal3DScene';
import styles from './DecalPreview.module.css';

export function DecalPreview({ body, element, context, expanded }: PreviewProps<'decal'>) {
  const track = useMemo(() => buildTrack(element.key_point_set), [element.key_point_set]);

  if (!expanded) {
    const argb = track.colors[0] ?? 0xffffffff;
    return (
      <span
        className={styles.thumb}
        data-testid="decal-thumb"
        style={{ background: argbToCss(argb) }}
      />
    );
  }

  const is2D = element.type_id === 101;

  const rows: FieldRow[] = [
    { label: 'subtype', value: <span>{subtypeLabel(element.type_id)}</span> },
    {
      label: 'tex_file',
      value: <PathOrText value={element.tex_file} listFiles={context.listFiles} />,
    },
    { divider: true },
    { label: 'width', value: <MonoNum value={body.width} /> },
    { label: 'height', value: <MonoNum value={body.height} /> },
    { label: 'rot_from_view', value: <BoolDot on={body.rot_from_view} /> },
  ];
  if (body.grnd_norm_only !== undefined)
    rows.push({ label: 'grnd_norm_only', value: <BoolDot on={!!body.grnd_norm_only} /> });
  if (body.match_surface !== undefined)
    rows.push({ label: 'match_surface', value: <BoolDot on={!!body.match_surface} /> });
  if (body.surface_use_parent_dir !== undefined)
    rows.push({
      label: 'surface_use_parent_dir',
      value: <BoolDot on={!!body.surface_use_parent_dir} />,
    });
  if (body.yaw_effect !== undefined)
    rows.push({ label: 'yaw_effect', value: <BoolDot on={!!body.yaw_effect} /> });
  if (body.screen_space !== undefined)
    rows.push({ label: 'screen_space', value: <BoolDot on={!!body.screen_space} /> });
  if (body.org_pt)
    rows.push({
      label: 'org_pt',
      value: (
        <span>
          {body.org_pt[0]}, {body.org_pt[1]}
        </span>
      ),
    });
  if (body.no_scale)
    rows.push({
      label: 'no_scale',
      value: (
        <span>
          {String(body.no_scale[0])}, {String(body.no_scale[1])}
        </span>
      ),
    });
  if (body.z_offset !== undefined)
    rows.push({ label: 'z_offset', value: <MonoNum value={body.z_offset} /> });
  if (body.max_extent !== undefined)
    rows.push({ label: 'max_extent', value: <MonoNum value={body.max_extent} /> });
  rows.push({ divider: true });
  rows.push({
    label: 'blend',
    value: <span>{formatBlendMode(element.src_blend, element.dest_blend)}</span>,
  });
  rows.push({
    label: 'tex_atlas',
    value: (
      <span>
        {element.tex_row}×{element.tex_col} @ {element.tex_interval}ms
      </span>
    ),
  });

  if (track.colors.length > 0) {
    rows.push({ divider: true });
    rows.push({ label: 'kp_start', value: <MonoNum value={track.startTimeMs} /> });
    rows.push({ label: 'kp_count', value: <MonoNum value={track.colors.length} /> });
    rows.push({
      label: 'kp_duration',
      value: track.loopable ? (
        <MonoNum value={track.loopDurationMs} />
      ) : (
        <span className={styles.holdForever}>∞ (hold)</span>
      ),
    });
    if (track.unhandledKinds.size > 0) {
      rows.push({
        label: 'unhandled_ctrls',
        value: (
          <span className={styles.unhandled}>
            {[...track.unhandledKinds].sort().join(', ')}
          </span>
        ),
      });
    }
  }

  return (
    <div className={styles.expanded}>
      {is2D ? (
        <Decal2DCanvas element={element} context={context} track={track} />
      ) : (
        <Decal3DScene body={body} element={element} context={context} track={track} />
      )}
      <FieldPanel rows={rows} />
    </div>
  );
}

function subtypeLabel(typeId: number): string {
  switch (typeId) {
    case 100:
      return 'Decal3D (world quad, view-aligned up)';
    case 101:
      return 'Decal2D (screen-space)';
    case 102:
      return 'DecalBillboard (always camera-facing)';
    default:
      return `Decal? (type ${typeId})`;
  }
}
