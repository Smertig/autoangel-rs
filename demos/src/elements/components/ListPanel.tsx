import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import styles from '../App.module.css';

export interface ListInfo {
  index: number;
  caption: string;
  entryCount: number;
}

interface ListPanelProps {
  lists: ListInfo[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Bump this value to reset the filter input (e.g., when a new file is loaded). */
  resetKey?: number;
}

export function ListPanel({ lists, selectedIndex, onSelect, resetKey }: ListPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reset when resetKey changes
  useEffect(() => {
    setInputValue('');
    setFilter('');
  }, [resetKey]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFilter(value), 150);
  };

  const lowerFilter = filter.toLowerCase();
  const visible = lowerFilter
    ? lists.filter(l => l.caption.toLowerCase().includes(lowerFilter))
    : lists;

  return (
    <>
      <div className={styles.panelHeader}>
        <input
          type="text"
          placeholder="Filter lists\u2026"
          value={inputValue}
          onChange={handleChange}
        />
      </div>
      <div className={styles.panelContent}>
        {visible.map(info => (
          <div
            key={info.index}
            className={`${styles.listItem}${info.index === selectedIndex ? ` ${styles.selected}` : ''}`}
            onClick={() => onSelect(info.index)}
          >
            {info.caption}
            <span className={styles.badge}>{info.entryCount}</span>
          </div>
        ))}
      </div>
    </>
  );
}
