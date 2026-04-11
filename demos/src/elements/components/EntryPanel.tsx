import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import styles from '../App.module.css';

export interface EntrySummary {
  index: number;
  id: string;
  name: string;
}

interface EntryPanelProps {
  entries: EntrySummary[];
  selectedIndex: number;
  title: string;
  onSelect: (index: number) => void;
  /** Bump this value to reset the search input (e.g., when a new list is selected). */
  resetKey?: number;
}

export function EntryPanel({ entries, selectedIndex, title, onSelect, resetKey }: EntryPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reset when resetKey changes (i.e., when a new list is selected)
  useEffect(() => {
    setInputValue('');
    setSearch('');
  }, [resetKey]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSearch(value), 150);
  };

  const lowerSearch = search.toLowerCase();
  const visible = lowerSearch
    ? entries.filter(e =>
        e.id.toLowerCase().includes(lowerSearch) ||
        e.name.toLowerCase().includes(lowerSearch)
      )
    : entries;

  return (
    <>
      <div className={styles.panelHeader}>
        <span>{title}</span>
        <input
          type="text"
          placeholder="Search ID or Name\u2026"
          value={inputValue}
          onChange={handleChange}
        />
      </div>
      <div className={styles.panelContent}>
        {visible.map(summary => (
          <div
            key={summary.index}
            className={`${styles.entryItem}${summary.index === selectedIndex ? ` ${styles.selected}` : ''}`}
            onClick={() => onSelect(summary.index)}
          >
            <span className={styles.entryId}>{summary.id}</span>
            {summary.name || `entry #${summary.index}`}
          </div>
        ))}
      </div>
    </>
  );
}
