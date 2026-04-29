import type { ReactNode } from 'react';
import type { FieldRow } from '../fieldPanel';
import { BoolDot, ColorSwatch, MonoNum, PathOrText, Vec3 } from '../formatters';
import { argbToCss } from '../util/argb';
import { formatBlendMode } from '../util/blendModes';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';
import styles from './particle.module.css';

type ParticleBody = Extract<ElementBody, { kind: 'particle' }>;

export function buildParticleRows(
  body: ParticleBody,
  element: GfxElement,
  ctx: ViewerCtx,
): FieldRow[] {
  const e = body.emitter;
  const rows: FieldRow[] = [];

  // Top (ungrouped): core particle-level fields.
  rows.push({ label: 'quota', value: <MonoNum value={body.quota} /> });
  rows.push({ label: 'particle_width', value: <MonoNum value={body.particle_width} /> });
  rows.push({ label: 'particle_height', value: <MonoNum value={body.particle_height} /> });
  rows.push({ label: 'three_d_particle', value: <BoolDot on={body.three_d_particle} /> });
  rows.push({ label: 'facing', value: <MonoNum value={body.facing} /> });

  rows.push({ divider: true });

  // Emission group.
  rows.push({ label: 'emission_rate', value: <MonoNum value={e.emission_rate} /> });
  rows.push({ label: 'ttl', value: <MonoNum value={e.ttl} /> });
  rows.push({ label: 'angle', value: <MonoNum value={e.angle} /> });
  rows.push({ label: 'speed', value: <MonoNum value={e.speed} /> });
  if (e.par_ini_dir !== undefined) {
    rows.push({ label: 'par_ini_dir', value: <Vec3 value={e.par_ini_dir} /> });
  }
  rows.push({ label: 'is_bind', value: <BoolDot on={e.is_bind} /> });
  rows.push({ label: 'is_surface', value: <BoolDot on={e.is_surface} /> });

  rows.push({ divider: true });

  // Appearance group.
  rows.push({
    label: 'color',
    value: <ColorRangeValue min={e.color_min} max={e.color_max} />,
  });
  rows.push({
    label: 'scale',
    value: <RangePair min={e.scale_min} max={e.scale_max} />,
  });
  if (e.rot_min !== undefined || e.rot_max !== undefined) {
    rows.push({
      label: 'rot',
      value: <RangePair min={e.rot_min ?? 0} max={e.rot_max ?? 0} />,
    });
  }
  rows.push({
    label: 'tex_file',
    value: <PathOrText value={element.tex_file} pkg={ctx.pkg} onNavigate={ctx.onNavigateToFile} />,
  });
  rows.push({
    label: 'tex_grid',
    value: (
      <span>
        <MonoNum value={element.tex_row} />
        <span aria-hidden="true"> × </span>
        <MonoNum value={element.tex_col} />
      </span>
    ),
  });
  rows.push({
    label: 'blend',
    value: <span>{formatBlendMode(element.src_blend, element.dest_blend)}</span>,
  });

  rows.push({ divider: true });

  // Physics group.
  if (e.par_acc !== undefined) {
    rows.push({ label: 'par_acc', value: <MonoNum value={e.par_acc} /> });
  }
  rows.push({ label: 'acc', value: <MonoNum value={e.acc} /> });
  rows.push({ label: 'acc_dir', value: <Vec3 value={e.acc_dir} /> });
  if (e.drag_pow !== undefined) {
    rows.push({ label: 'drag_pow', value: <MonoNum value={e.drag_pow} /> });
  }
  if (e.is_drag !== undefined) {
    rows.push({ label: 'is_drag', value: <BoolDot on={e.is_drag} /> });
  }

  // Flags cluster (optional — only render divider if any flag present).
  const flags = collectFlagRows(body, e);
  if (flags.length > 0) {
    rows.push({ divider: true });
    rows.push(...flags);
  }

  return rows;
}

function collectFlagRows(body: ParticleBody, e: ParticleBody['emitter']): FieldRow[] {
  const flags: Record<string, boolean | undefined> = {
    scale_no_off: body.scale_no_off,
    is_use_par_uv: body.is_use_par_uv,
    is_start_on_grnd: body.is_start_on_grnd,
    stop_emit_when_fade: body.stop_emit_when_fade,
    init_random_texture: body.init_random_texture,
    is_use_hsv_interp: e.is_use_hsv_interp,
  };
  const rows: FieldRow[] = [];
  for (const [k, v] of Object.entries(flags)) {
    if (v !== undefined) rows.push({ label: k, value: <BoolDot on={!!v} /> });
  }
  return rows;
}

function ColorRangeValue({ min, max }: { min: number; max: number }): ReactNode {
  return (
    <span className={styles.colorRange}>
      <ColorSwatch argb={min} />
      <span
        className={styles.colorGradient}
        style={{
          background: `linear-gradient(to right, ${argbToCss(min)}, ${argbToCss(max)})`,
        }}
        aria-hidden="true"
      />
      <ColorSwatch argb={max} />
    </span>
  );
}

function RangePair({ min, max }: { min: number; max: number }): ReactNode {
  return (
    <span>
      <MonoNum value={min} />
      <span aria-hidden="true"> … </span>
      <MonoNum value={max} />
    </span>
  );
}
