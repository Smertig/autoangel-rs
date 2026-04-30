import type { FieldRow } from '../fieldPanel';
import { BoolDot, MonoNum, PathOrText } from '../formatters';
import { buildTrack } from '../util/keypointTrack';
import { formatBlendMode } from '../util/blendModes';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';
import { flagRows } from './_helpers';
import styles from './decal.module.css';

type GridDecalBody = Extract<ElementBody, { kind: 'grid_decal_3d' }>;

export function buildGridDecalRows(
  body: GridDecalBody,
  element: GfxElement,
  ctx: ViewerCtx,
): FieldRow[] {
  const track = buildTrack(element.key_point_set);
  const animKeys = body.animation_keys ?? [];

  const rows: FieldRow[] = [
    {
      label: 'tex_file',
      value: <PathOrText value={element.tex_file} pkg={ctx.pkg} onNavigate={ctx.onNavigateToFile} />,
    },
    { divider: true },
    { label: 'w_number', value: <MonoNum value={body.w_number} /> },
    { label: 'h_number', value: <MonoNum value={body.h_number} /> },
    { label: 'grid_size', value: <MonoNum value={body.grid_size} /> },
  ];
  rows.push(...flagRows({
    aff_by_scl: body.aff_by_scl ?? undefined,
    rot_from_view: body.rot_from_view ?? undefined,
  }));
  if (body.always_on_ground !== undefined)
    rows.push({
      label: 'always_on_ground',
      value: (
        <span>
          <BoolDot on={!!body.always_on_ground} />
          {body.always_on_ground ? (
            <span className={styles.holdForever}> (not previewed: no terrain)</span>
          ) : null}
        </span>
      ),
    });
  if (body.z_offset !== undefined)
    rows.push({
      label: 'z_offset',
      value: (
        <span>
          <MonoNum value={body.z_offset} />
          <span className={styles.holdForever}> (2D-mode only)</span>
        </span>
      ),
    });
  if (body.offset_height !== undefined)
    rows.push({
      label: 'offset_height',
      value: (
        <span>
          <MonoNum value={body.offset_height} />
          <span className={styles.holdForever}> (used with always_on_ground)</span>
        </span>
      ),
    });
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

  rows.push({ divider: true });
  rows.push({
    label: 'anim_keys',
    value: (
      <span>
        <MonoNum value={animKeys.length} />
        {animKeys.length > 0 ? (
          <>
            {' @ '}
            <MonoNum value={animKeys[animKeys.length - 1].time_ms} />
            ms
          </>
        ) : null}
      </span>
    ),
  });

  return rows;
}
