import type { Session } from '../history/types';
import { SessionCard } from './SessionCard';
import styles from './SessionsRail.module.css';

interface SessionsRailProps {
  sessions: Session[];
  loading: boolean;
  onOpen: (session: Session) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export function SessionsRail({
  sessions,
  loading,
  onOpen,
  onRemove,
  onClearAll,
}: SessionsRailProps) {
  function handleClear() {
    if (sessions.length === 0) return;
    if (window.confirm(`Clear all ${sessions.length} sessions from history?`)) onClearAll();
  }

  return (
    <aside className={styles.rail} aria-label="Session history">
      <header className={styles.header}>
        <span className={styles.title}>History</span>
        {sessions.length > 0 && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={handleClear}
            title="Clear all history"
          >
            Clear
          </button>
        )}
      </header>

      <div className={styles.scrollArea}>
        {loading && <p className={styles.placeholder}>{'Loading\u2026'}</p>}

        {!loading && sessions.length === 0 && (
          <p className={styles.placeholder}>
            Packages you open will show up here so you can pick up where you left off.
          </p>
        )}

        {sessions.length > 0 && (
          <div className={styles.list}>
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} onOpen={onOpen} onRemove={onRemove} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
