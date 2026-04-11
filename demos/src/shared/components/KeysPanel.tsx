import React, { useState } from 'react';
import styles from './KeysPanel.module.css';

export interface KeyConfig {
  key1: number;
  key2: number;
  guard1: number;
  guard2: number;
}

interface KeysPanelProps {
  open?: boolean;
  onToggle?: () => void;
  onKeysChange?: (keys: KeyConfig | null) => void;
  /** 'inline' = pck-diff chooser style (bordered box, gray bg); default = pck style (surface bg, border-bottom) */
  variant?: 'default' | 'inline';
}

type FieldName = 'key1' | 'key2' | 'guard1' | 'guard2';

const FIELD_LABELS: Record<FieldName, string> = {
  key1: 'Key 1',
  key2: 'Key 2',
  guard1: 'Guard 1',
  guard2: 'Guard 2',
};

const DEFAULT_VALUES: Record<FieldName, string> = {
  key1: '0xA8937462',
  key2: '0x59374231',
  guard1: '0xFDFDFEEE',
  guard2: '0xF00DBEEF',
};

function isDefault(values: Record<FieldName, string>): boolean {
  return (Object.keys(DEFAULT_VALUES) as FieldName[]).every(
    k => values[k].toLowerCase() === DEFAULT_VALUES[k].toLowerCase()
  );
}

function parseKeyValues(values: Record<FieldName, string>): KeyConfig | null {
  if (isDefault(values)) return null;
  const parse = (v: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid key value: "${v}"`);
    return n >>> 0;
  };
  return {
    key1: parse(values.key1),
    key2: parse(values.key2),
    guard1: parse(values.guard1),
    guard2: parse(values.guard2),
  };
}

export function KeysPanel({ open = false, onToggle, onKeysChange, variant = 'default' }: KeysPanelProps) {
  const [values, setValues] = useState<Record<FieldName, string>>({ ...DEFAULT_VALUES });

  const defaultState = isDefault(values);

  const handleFieldChange = (field: FieldName, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    if (onKeysChange) {
      try {
        onKeysChange(parseKeyValues(next));
      } catch {
        // keep invalid input visible without notifying parent
      }
    }
  };

  const handleReset = () => {
    setValues({ ...DEFAULT_VALUES });
    onKeysChange?.(null);
  };

  const toggleClass = [
    styles.keysToggle,
    open ? styles.active : '',
    !defaultState ? styles.hasCustom : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button className={toggleClass} onClick={onToggle} title="Custom encryption keys">
        <svg
          viewBox="0 0 20 20"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16.5 10.5l-3-3m0 0l-3 3m3-3v8M7 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
        </svg>
        <span>Keys</span>
      </button>

      {open && (
        <div className={variant === 'inline' ? styles.keysPanelInline : styles.keysPanel}>
          <div className={styles.keysBody}>
            <div className={styles.keysFields}>
              {(Object.keys(DEFAULT_VALUES) as FieldName[]).map(field => {
                const modified =
                  values[field].toLowerCase() !== DEFAULT_VALUES[field].toLowerCase();
                return (
                  <label key={field} className={styles.keyField}>
                    <span>{FIELD_LABELS[field]}</span>
                    <input
                      type="text"
                      value={values[field]}
                      spellCheck={false}
                      className={modified ? styles.modified : undefined}
                      onChange={e => handleFieldChange(field, e.target.value)}
                    />
                  </label>
                );
              })}
            </div>
            <div className={styles.keysActions}>
              <div className={[styles.keysInfo, !defaultState ? styles.custom : ''].filter(Boolean).join(' ')}>
                {defaultState
                  ? 'Default keys. Change values and re-open a file to use custom keys.'
                  : 'Custom keys set. Re-open a file to apply.'}
              </div>
              <button className={styles.btn} onClick={handleReset} disabled={defaultState}>
                Reset to defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
