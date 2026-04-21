import { useEffect, useRef, type RefObject } from 'react';
import { FieldPanel, FieldRow } from '../fieldPanel';
import { MonoNum, Vec3, ColorSwatch, BoolDot } from '../formatters';
import { argbToCss, argbToHex } from '../util/argb';
import { buildTrack, sampleTrack, trackSignature, type Track } from '../util/keypointTrack';
import type { PreviewProps } from './types';
import styles from './LightPreview.module.css';

export function LightPreview({ body, element, expanded }: PreviewProps<'light'>) {
  const diffuseRef = useRef<HTMLSpanElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const track = buildTrack(element.key_point_set);
  const signature = trackSignature(track);

  useEffect(() => {
    const paintStatic = () => {
      const c = track.colors[0];
      if (diffuseRef.current) {
        diffuseRef.current.style.background = c !== undefined ? argbToCss(c) : '';
      }
      if (cursorRef.current) cursorRef.current.style.left = '0%';
    };
    if (!expanded || !track.loopable) {
      paintStatic();
      return;
    }
    let raf = 0;
    const startMs = performance.now();
    const tick = () => {
      const localMs = (performance.now() - startMs) % track.loopDurationMs;
      const { color, normalized } = sampleTrack(track, localMs);
      if (diffuseRef.current) diffuseRef.current.style.background = argbToCss(color);
      if (cursorRef.current) cursorRef.current.style.left = `${(normalized * 100).toFixed(2)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `signature` captures track content as a primitive — avoids re-running
    // when the wasm binding re-creates an identity-equivalent object.
  }, [expanded, signature]);

  if (!expanded) {
    return (
      <span className={styles.thumb} style={{ background: `linear-gradient(135deg, ${argbToCss(body.diffuse)}, ${argbToCss(body.ambient)})` }} />
    );
  }

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

  return (
    <div className={styles.expanded}>
      <div className={styles.summary}>
        <div className={styles.swatchColumn}>
          <LightBigSwatch label="diffuse" argb={body.diffuse} fillRef={diffuseRef} animated={track.loopable} />
          <LightBigSwatch label="specular" argb={body.specular} />
          <LightBigSwatch label="ambient" argb={body.ambient} />
        </div>
        {track.colors.length > 0 && <KeyPointTimeline track={track} cursorRef={cursorRef} />}
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

function LightBigSwatch({
  label,
  argb,
  fillRef,
  animated,
}: {
  label: string;
  argb: number;
  fillRef?: RefObject<HTMLSpanElement | null>;
  animated?: boolean;
}) {
  return (
    <div className={styles.bigSwatch}>
      <span
        ref={fillRef}
        className={styles.bigSwatchFill}
        style={{ background: argbToCss(argb) }}
        data-testid="big-swatch"
        data-animated={animated ? 'true' : undefined}
      />
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

function KeyPointTimeline({
  track,
  cursorRef,
}: {
  track: Track;
  cursorRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className={styles.timeline} data-testid="kp-timeline">
      {track.colors.map((argb, i) => {
        const span = track.spans[i];
        const isHold = span < 0;
        return (
          <span
            key={i}
            className={isHold ? styles.timelineHold : styles.timelineBlock}
            style={{
              flex: isHold ? '0 0 32px' : `${Math.max(span, 1)} 0 0`,
              background: argbToCss(argb),
            }}
            title={isHold ? `kp ${i}: hold` : `kp ${i}: ${span} ms`}
          />
        );
      })}
      <div ref={cursorRef} className={styles.timelineCursor} aria-hidden />
    </div>
  );
}

