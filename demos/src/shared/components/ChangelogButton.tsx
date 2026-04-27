import { useEffect, useRef, useState } from 'react';
import {
  CHANGELOG,
  type ChangelogEntry,
  type ChangelogScope,
  type DemoScope,
  entriesForScope,
  hasUnseen,
  initLastSeenIfMissing,
  markScopeSeen,
  unseenIdsSnapshot,
} from '../changelog';
import styles from './ChangelogButton.module.css';

interface ChangelogButtonProps {
  scope: DemoScope;
  /** Test-only override. Production callers omit. */
  entries?: ChangelogEntry[];
}

const SCOPE_CLASS: Record<ChangelogScope, string> = {
  elements: styles.scopeElements,
  pck: styles.scopePck,
  'pck-diff': styles.scopePckDiff,
  shared: styles.scopeShared,
};

export function ChangelogButton({ scope, entries = CHANGELOG }: ChangelogButtonProps) {
  const [unseen, setUnseen] = useState(false);
  const [open, setOpen] = useState(false);
  const [viewAll, setViewAll] = useState(false);
  const [unseenSnapshot, setUnseenSnapshot] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initLastSeenIfMissing(entries);
    setUnseen(hasUnseen(scope, entries));
  }, [scope, entries]);

  function close() {
    setOpen(false);
    setViewAll(false);
  }

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  function toggle() {
    if (open) {
      close();
      return;
    }
    setUnseenSnapshot(unseenIdsSnapshot(entries));
    if (unseen) {
      markScopeSeen(scope, entries);
      setUnseen(false);
    }
    setOpen(true);
  }

  const visible = entriesForScope(viewAll ? null : scope, entries);

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="What's new"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="What's new"
        onClick={toggle}
      >
        ✦
        {unseen && <span className={styles.dot} data-testid="changelog-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Changelog">
          <header className={styles.panelHeader}>
            <hr className={styles.rule} aria-hidden="true" />
            <h2 className={styles.heading}>{viewAll ? 'All updates' : 'Updates'}</h2>
          </header>
          {visible.length === 0 ? (
            <div className={styles.empty}>No updates for this demo.</div>
          ) : (
            visible.map(e => (
              <div
                key={e.id}
                className={styles.entry}
                data-new={unseenSnapshot.has(e.id) ? 'true' : undefined}
              >
                <span className={styles.entryDate}>{e.date}</span>
                {viewAll && (
                  <span className={`${styles.entryScope} ${SCOPE_CLASS[e.scope]}`}>
                    {e.scope}
                  </span>
                )}
                <span className={styles.entryTitle}>{e.title}</span>
                {e.body && <div className={styles.entryBody}>{e.body}</div>}
              </div>
            ))
          )}
          {!viewAll && (
            <button
              type="button"
              className={styles.viewAll}
              onClick={() => setViewAll(true)}
            >
              View all updates →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
