import { FieldPanel, FieldRow } from '../fieldPanel';
import { MonoNum, Vec3, ColorSwatch, BoolDot } from '../formatters';
import { argbToCss, argbToHex } from '../util/argb';
import type { PreviewProps } from './types';
import styles from './LightPreview.module.css';

export function LightPreview({ body, expanded }: PreviewProps<'light'>) {
  if (!expanded) {
    return (
      <span className={styles.thumb} style={{ background: `linear-gradient(135deg, ${argbToCss(body.diffuse)}, ${argbToCss(body.ambient)})` }} />
    );
  }
  // Radiometric scalars (range/falloff/theta/phi) appear in both the
  // left-column summary AND the right-column FieldPanel — deliberate
  // "specimen catalogue" duplication per the design doc (field photo +
  // full taxonomy).
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
  return (
    <div className={styles.expanded}>
      <div className={styles.summary}>
        <div className={styles.swatchColumn}>
          <LightBigSwatch label="diffuse" argb={body.diffuse} />
          <LightBigSwatch label="specular" argb={body.specular} />
          <LightBigSwatch label="ambient" argb={body.ambient} />
        </div>
        <div className={styles.scalarGrid}>
          <ScalarCell label="range" value={body.range} />
          <ScalarCell label="theta" value={body.theta} />
          <ScalarCell label="falloff" value={body.falloff} />
          <ScalarCell label="phi" value={body.phi} />
        </div>
      </div>
      <FieldPanel rows={rows} />
    </div>
  );
}

function LightBigSwatch({ label, argb }: { label: string; argb: number }) {
  return (
    <div className={styles.bigSwatch}>
      <span className={styles.bigSwatchFill} style={{ background: argbToCss(argb) }} data-testid="big-swatch" />
      <span className={styles.bigSwatchLabel}>{label}</span>
      <span className={styles.bigSwatchHex}>{argbToHex(argb)}</span>
    </div>
  );
}

function ScalarCell({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.scalarCell}>
      <span className={styles.scalarLabel}>{label}</span>
      <MonoNum value={value} />
    </div>
  );
}
