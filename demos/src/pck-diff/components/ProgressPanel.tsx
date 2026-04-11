import React from 'react';
import styles from '../App.module.css';

interface ProgressPanelProps {
  leftProgress: number;   // 0-100
  rightProgress: number;
  leftDone: boolean;
  rightDone: boolean;
  verifyProgress: number;
  verifyTotal: number;
  verifyDone: number;
  leftLabel: string;
  rightLabel: string;
  inline?: boolean;
}

function ProgressItem({
  label,
  progress,
  done,
  inline,
}: {
  label: string;
  progress: number;
  done: boolean;
  inline?: boolean;
}) {
  const fillClass = [
    styles.progressFill,
    done ? styles.progressDone : '',
    inline && !done ? styles.noTransition : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.progressItem}>
      <span className={styles.progressLabel}>{label}</span>
      <div className={styles.progressBar}>
        <div
          className={fillClass}
          style={{ width: done ? '100%' : `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function ProgressPanel({
  leftProgress,
  rightProgress,
  leftDone,
  rightDone,
  verifyProgress,
  verifyTotal,
  verifyDone,
  leftLabel,
  rightLabel,
  inline,
}: ProgressPanelProps) {
  const wrapClass = [
    styles.progress,
    inline ? styles.progressInline : '',
  ].filter(Boolean).join(' ');

  const verifyLabel = verifyTotal === 0
    ? 'Verifying modified files...'
    : verifyDone >= verifyTotal
      ? `Verified (${verifyTotal} files)`
      : `Verifying ${verifyDone} / ${verifyTotal} mismatched files...`;

  return (
    <div className={wrapClass}>
      {!inline && <div className={styles.progressTitle}>Comparing packages...</div>}
      <ProgressItem
        label={leftLabel}
        progress={leftProgress}
        done={leftDone}
        inline={inline}
      />
      <ProgressItem
        label={rightLabel}
        progress={rightProgress}
        done={rightDone}
        inline={inline}
      />
      {verifyTotal > 0 && (
        <ProgressItem
          label={verifyLabel}
          progress={verifyTotal > 0 ? Math.round((verifyDone / verifyTotal) * 100) : 0}
          done={verifyDone >= verifyTotal && verifyTotal > 0}
          inline={inline}
        />
      )}
    </div>
  );
}
