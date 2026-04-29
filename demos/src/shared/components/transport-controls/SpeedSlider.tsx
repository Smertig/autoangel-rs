import { useCallback } from 'react';
import {
  speedToFraction, fractionToSpeed, snapSpeedToPreset,
} from './speedMapping';
import styles from './transport-controls.module.css';

interface SpeedSliderProps {
  value: number;
  onChange: (next: number) => void;
}

function formatSpeed(s: number) {
  return s >= 1 ? `${s.toFixed(1)}×` : `${s.toFixed(2)}×`;
}

export function SpeedSlider({ value, onChange }: SpeedSliderProps) {
  const fraction = speedToFraction(value);
  const onWheel = useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    onChange(snapSpeedToPreset(value * Math.pow(2, dir * 0.5)));
  }, [value, onChange]);

  return (
    <div
      className={`${styles.speedWrap} ${value === 1 ? styles.speedAtDefault : ''}`}
      style={{ ['--speed-fill' as any]: `${fraction * 100}%` }}
    >
      <input
        type="range"
        className={styles.speedSlider}
        min={0}
        max={1}
        step="any"
        value={fraction}
        title="Playback speed (double-click to reset)"
        onChange={(e) => onChange(snapSpeedToPreset(fractionToSpeed(Number(e.target.value))))}
        onDoubleClick={() => onChange(1)}
        onWheel={onWheel}
      />
      <span className={styles.speedLabel}>{formatSpeed(value)}</span>
    </div>
  );
}
