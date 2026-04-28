import { useMemo } from 'react';
import type { LoadingEntry, PackageSlot } from '../usePackageSlots';
import { useFileDrop, type PickedItem } from '@shared/hooks/useFileDrop';
import { PackageChip, type IndexDetails, type PackageChipProps } from './PackageChip';
import styles from './PackageChipRow.module.css';

interface PackageChipRowProps {
  slots: PackageSlot[];
  loadingEntries: LoadingEntry[];
  onRemove: (pkgId: number) => void;
  onDrop: (items: PickedItem[]) => void;
  /** Resolves a slot's indexer details for chip display + popover.
   *  Returns null when the indexer hasn't seen this pkgId yet. */
  getIndexDetails?: (pkgId: number) => IndexDetails | null;
}

export function PackageChipRow({
  slots,
  loadingEntries,
  onRemove,
  onDrop,
  getIndexDetails,
}: PackageChipRowProps) {
  const { over, dragProps, inputProps, triggerPicker } = useFileDrop({ onFiles: onDrop, multiple: true });

  // Merge loaded slots and loading entries into a single list sorted by stem,
  // so a chip keeps its position through its lifecycle (loading -> loaded)
  // instead of jumping into the loaded group on completion.
  const chips = useMemo(() => {
    const items: Array<{ key: string; props: PackageChipProps }> = [];
    for (const slot of slots) {
      items.push({
        key: slot.stem,
        props: {
          state: 'loaded',
          stem: slot.stem,
          color: slot.color,
          fileCount: slot.fileCount,
          version: slot.version,
          onRemove: () => onRemove(slot.pkgId),
          indexDetails: getIndexDetails?.(slot.pkgId) ?? null,
        },
      });
    }
    for (const entry of loadingEntries) {
      items.push({
        key: entry.stem,
        props: {
          state: 'loading',
          stem: entry.stem,
          color: entry.color,
          progress: entry.progress,
        },
      });
    }
    items.sort((a, b) => a.key.localeCompare(b.key));
    return items;
  }, [slots, loadingEntries, onRemove, getIndexDetails]);

  return (
    <div className={styles.row}>
      {chips.map((item) => (
        <PackageChip key={item.key} {...item.props} />
      ))}
      <button
        type="button"
        className={styles.add}
        data-over={over ? 'true' : undefined}
        data-testid="package-add"
        aria-label="Add packages"
        onClick={triggerPicker}
        {...dragProps}
      >
        <span className={styles.addLabel}>+ Add packages</span>
        <input {...inputProps} className={styles.fileInput} />
      </button>
    </div>
  );
}
