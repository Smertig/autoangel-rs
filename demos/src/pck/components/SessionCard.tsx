import { memo } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { formatSize } from '@shared/util/files';
import type { Session } from '../history/types';
import styles from './SessionCard.module.css';

interface SessionCardProps {
  session: Session;
  onOpen: (session: Session) => void;
  onRemove: (id: string) => void;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function relativeTime(then: number, now: number): string {
  const delta = now - then;
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function totalSize(session: Session): number {
  let n = 0;
  for (const f of session.files) n += f.pckSize;
  return n;
}

function exploredHint(session: Session): string {
  const opens = session.openCount;
  const clicks = session.exploredCount;
  const opensWord = opens === 1 ? 'open' : 'opens';
  if (clicks === 0) return `${opens} ${opensWord}, no clicks yet`;
  const clicksWord = clicks === 1 ? 'click' : 'clicks';
  const base = `${clicks} file ${clicksWord} across ${opens} ${opensWord}`;
  const top = session.recentEntries?.slice(0, 5) ?? [];
  if (top.length === 0) return base;
  return `${base}\n\nRecent:\n${top.map((e) => `\u2022 ${e.path}`).join('\n')}`;
}

export const SessionCard = memo(function SessionCard({ session, onOpen, onRemove }: SessionCardProps) {
  const now = Date.now();
  const count = session.files.length;
  const namesLine = session.files.map((f) => f.pckName).join(' \u00b7 ');
  const sizeBytes = totalSize(session);

  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    onRemove(session.id);
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(session);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.card}
      onClick={() => onOpen(session)}
      onKeyDown={handleKey}
      title={`Reopen ${count === 1 ? namesLine : `${count} packages`} (${formatSize(sizeBytes)})`}
      data-testid="session-card"
    >
      <div className={styles.titleRow}>
        <span className={styles.title}>{namesLine}</span>
        <button
          type="button"
          className={styles.remove}
          onClick={handleRemove}
          title="Forget this session"
          aria-label="Forget session"
        >
          {'\u00d7'}
        </button>
      </div>
      <div className={styles.metaRow}>
        <span className={styles.meta}>
          {count} {count === 1 ? 'package' : 'packages'}
          {' \u00b7 '}
          <span title={new Date(session.lastUsedAt).toLocaleString()}>
            {relativeTime(session.lastUsedAt, now)}
          </span>
        </span>
        <span className={styles.explored} title={exploredHint(session)}>
          <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
            {/* arrow up-right */}
            <path
              fill="currentColor"
              d="M5 3h7v7h-2V6.41L4.7 11.71 3.29 10.3 8.59 5H5z"
            />
          </svg>
          <span>{session.exploredCount}</span>
        </span>
      </div>
    </div>
  );
});
