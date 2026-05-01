import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { PackageSlot } from '../usePackageSlots';
import type { RecentEntry } from '../history/types';
import { basename, dirname } from '@shared/util/path';
import styles from './RecentEntries.module.css';

interface RecentEntriesProps {
  entries: readonly RecentEntry[];
  slots: readonly PackageSlot[];
  selectedPath: string | null;
  selectedPkgId: number | null;
  onSelect: (target: { pkgId: number; path: string }) => void;
}

const OPEN_STORAGE_KEY = 'pck.recentEntries.open';

function readInitialOpen(): boolean {
  // Default open. Explicit `'0'` preserves a prior collapse choice.
  try {
    const raw = window.localStorage.getItem(OPEN_STORAGE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Best-effort only (private mode, quota, etc.).
  }
}


interface Row extends RecentEntry {
  slot: PackageSlot | null;
  isSelected: boolean;
  dir: string;
  name: string;
}

export const RecentEntries = memo(function RecentEntries({
  entries,
  slots,
  selectedPath,
  selectedPkgId,
  onSelect,
}: RecentEntriesProps) {
  const [open, setOpen] = useState<boolean>(readInitialOpen);

  useEffect(() => {
    writeOpen(open);
  }, [open]);

  const slotByPckName = useMemo(() => {
    const m = new Map<string, PackageSlot>();
    for (const s of slots) m.set(`${s.stem}.pck`.toLowerCase(), s);
    return m;
  }, [slots]);

  const multiPackage = slots.length > 1;

  const rows: Row[] = useMemo(
    () =>
      entries.map((e) => {
        const slot = slotByPckName.get(e.pckName.toLowerCase()) ?? null;
        const isSelected =
          slot !== null && slot.pkgId === selectedPkgId && e.path === selectedPath;
        return { ...e, slot, isSelected, dir: dirname(e.path), name: basename(e.path) };
      }),
    [entries, slotByPckName, selectedPkgId, selectedPath],
  );

  const handleRowClick = useCallback(
    (row: Row) => {
      if (!row.slot) return;
      onSelect({ pkgId: row.slot.pkgId, path: row.path });
    },
    [onSelect],
  );

  const handleRowKey = useCallback(
    (e: KeyboardEvent<HTMLLIElement>, row: Row) => {
      if (!row.slot) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect({ pkgId: row.slot.pkgId, path: row.path });
      }
    },
    [onSelect],
  );

  const handleHeaderClick = useCallback(() => setOpen((v) => !v), []);
  const handleHeaderKey = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  return (
    <div
      className={styles.container}
      data-testid="recent-entries"
      data-open={open || undefined}
    >
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        onClick={handleHeaderClick}
        onKeyDown={handleHeaderKey}
      >
        <span className={styles.caret} aria-hidden="true">
          {open ? '\u25be' : '\u25b8'}
        </span>
        <span className={styles.headerLabel}>Recent</span>
        <span className={styles.count}>{entries.length}</span>
      </button>
      {open && entries.length === 0 && (
        <div className={styles.empty}>
          No recent files yet — pick something from the tree.
        </div>
      )}
      {open && entries.length > 0 && (
        <ul className={styles.list} role="list">
          {rows.map((row) => {
            const disabled = row.slot === null;
            const colorStyle = row.slot ? { borderLeftColor: row.slot.color } : undefined;
            const title = multiPackage
              ? `${row.pckName}: ${row.path}`
              : row.path;
            const onClickGuarded = (e: MouseEvent) => {
              e.stopPropagation();
              handleRowClick(row);
            };
            return (
              <li
                key={`${row.pckName}|${row.path}`}
                className={styles.row}
                data-selected={row.isSelected || undefined}
                data-disabled={disabled || undefined}
                style={colorStyle}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled || undefined}
                title={disabled ? `${title} (package not loaded)` : title}
                onClick={disabled ? undefined : onClickGuarded}
                onKeyDown={(e) => handleRowKey(e, row)}
              >
                <span className={styles.name}>{row.name}</span>
                {row.dir && <span className={styles.dir}>{row.dir}</span>}
                {multiPackage && row.slot && (
                  <span className={styles.pkgTag} style={{ color: row.slot.color }}>
                    {row.slot.stem}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
