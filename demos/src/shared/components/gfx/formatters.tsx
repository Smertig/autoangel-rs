import type { MouseEvent, KeyboardEvent } from 'react';
import { argbToCss, argbToHex } from './util/argb';
import type { FindFile } from './util/resolveEnginePath';
import styles from './formatters.module.css';

export function MonoNum({ value }: { value: number }) {
  const formatted = formatNum(value);
  return <span className={styles.monoNum}>{formatted}</span>;
}

function formatNum(value: number): string {
  if (Number.isInteger(value)) {
    if (Math.abs(value) >= 10000) {
      return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
    }
    return value.toString();
  }
  const rounded = Number(value.toFixed(3));
  return rounded.toString().replace('-', '−');
}

export function Vec3({ value }: { value: [number, number, number] }) {
  return (
    <span className={styles.vec3}>
      <span className={styles.vec3Cell}>{formatNum(value[0])}</span>
      <span className={styles.vec3Cell}>{formatNum(value[1])}</span>
      <span className={styles.vec3Cell}>{formatNum(value[2])}</span>
    </span>
  );
}

export function ColorSwatch({ argb }: { argb: number }) {
  return (
    <span className={styles.swatch}>
      <span
        data-testid="swatch-fill"
        className={styles.swatchFill}
        style={{ background: argbToCss(argb) }}
      />
      <span className={styles.swatchHex}>{argbToHex(argb)}</span>
    </span>
  );
}

export function BoolDot({ on }: { on: boolean }) {
  return (
    <span className={styles.boolDot}>
      <span className={on ? styles.dotOn : styles.dotOff} aria-hidden="true">{on ? '●' : '○'}</span>
      <span className={styles.boolLabel}>{on ? 'on' : 'off'}</span>
    </span>
  );
}

interface PathOrTextProps {
  value: string;
  findFile: FindFile;
  /** If provided and `value` resolves, render a ↗ button that opens the
   *  resolved file. Receives the canonical-cased path. */
  onNavigate?: (resolvedPath: string) => void;
}
export function PathOrText({ value, findFile, onNavigate }: PathOrTextProps) {
  const resolved = findFile(value);
  if (resolved !== null && onNavigate !== undefined) {
    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onNavigate(resolved);
    };
    const handleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onNavigate(resolved);
      }
    };
    return (
      <span className={`${styles.path} ${styles.pathClickable}`}>
        <span className={styles.pathValue}>{value}</span>
        <button
          type="button"
          className={styles.pathOpenBtn}
          onClick={handleClick}
          onKeyDown={handleKey}
          aria-label={`Open ${resolved}`}
        >
          ↗
        </button>
      </span>
    );
  }
  return (
    <span className={styles.path}>
      <span className={styles.pathValue}>{value}</span>
    </span>
  );
}

export function MonoJson({ value }: { value: unknown }) {
  return <span className={styles.monoJson}>{JSON.stringify(value)}</span>;
}
