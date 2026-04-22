import { EmptyDropPanel } from './EmptyDropPanel';
import { SessionsRail } from './SessionsRail';
import type { Session } from '../history/types';
import type { PickedItem } from '@shared/hooks/useFileDrop';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  sessions: Session[];
  loading: boolean;
  onDrop: (items: PickedItem[]) => void;
  onOpenSession: (session: Session) => void;
  onRemoveSession: (id: string) => void;
  onClearAll: () => void;
}

export function EmptyState({
  sessions,
  loading,
  onDrop,
  onOpenSession,
  onRemoveSession,
  onClearAll,
}: EmptyStateProps) {
  return (
    <div className={styles.layout}>
      <EmptyDropPanel onDrop={onDrop} />
      <SessionsRail
        sessions={sessions}
        loading={loading}
        onOpen={onOpenSession}
        onRemove={onRemoveSession}
        onClearAll={onClearAll}
      />
    </div>
  );
}
