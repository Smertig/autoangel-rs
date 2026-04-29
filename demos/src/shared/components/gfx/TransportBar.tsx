import { useEffect } from 'react';
import { SpeedSlider } from '../transport-controls/SpeedSlider';
import styles from './TransportBar.module.css';

interface Props {
  playing: boolean;
  onPlayToggle: () => void;
  onRestart: () => void;
  currentSec: number;
  totalSec: number;        // Infinity for unbounded GFX.
  speed: number;
  onSpeedChange: (next: number) => void;
  loopPulse: boolean;
}

function isInputTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function TransportBar(p: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isInputTarget(e.target)) return;
      if (e.key === ' ') { e.preventDefault(); p.onPlayToggle(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); p.onRestart(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [p.onPlayToggle, p.onRestart]);

  return (
    <div className={styles.bar}>
      <button
        type="button" className={styles.btn}
        onClick={p.onPlayToggle}
        title={p.playing ? 'Pause (space)' : 'Play (space)'}
      >{p.playing ? '⏸' : '▶'}</button>
      <button
        type="button" className={styles.btn}
        onClick={p.onRestart} title="Restart (R)"
      >⟲</button>
      <span
        className={styles.loopDot}
        data-testid="loop-pulse"
        data-pulsing={p.loopPulse ? 'true' : 'false'}
        aria-hidden
      />
      <span className={styles.time}>
        {formatTime(p.currentSec)}
        {Number.isFinite(p.totalSec)
          ? <> / {formatTime(p.totalSec)}</>
          : <> / <span className={styles.infinity}>∞</span></>}
      </span>
      <span className={styles.spacer} />
      <SpeedSlider value={p.speed} onChange={p.onSpeedChange} />
    </div>
  );
}

function formatTime(s: number) { return `${s.toFixed(2)}s`; }
