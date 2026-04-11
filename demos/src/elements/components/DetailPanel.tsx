import { useState } from 'react';
import styles from '../App.module.css';

function formatHex(bytes: Uint8Array): string {
  const lines: string[] = [];
  const limit = Math.min(bytes.length, 1024);
  for (let i = 0; i < limit; i += 16) {
    const chunk = bytes.subarray(i, Math.min(i + 16, limit));
    const offset = i.toString(16).padStart(6, '0');
    const hex = [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk].map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
    lines.push(`${offset}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (bytes.length > limit) {
    lines.push(`... ${bytes.length - limit} more bytes`);
  }
  return lines.join('\n');
}

function BytesField({ bytes }: { bytes: Uint8Array }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <span
        className={styles.bytesToggle}
        onClick={() => setExpanded(e => !e)}
      >
        [{bytes.length} bytes] {expanded ? 'hide' : 'show'}
      </span>
      {expanded && (
        <div className={styles.bytesHex}>
          {formatHex(bytes)}
        </div>
      )}
    </>
  );
}

function FieldValue({ value }: { value: unknown }) {
  if (value instanceof Uint8Array) {
    return (
      <td className={`${styles.fieldValue} ${styles.bytesValue}`}>
        <BytesField bytes={value} />
      </td>
    );
  }
  if (typeof value === 'number') {
    return (
      <td className={`${styles.fieldValue} ${styles.numberValue}`}>
        {Number.isInteger(value) ? value.toString() : value.toFixed(6)}
      </td>
    );
  }
  if (typeof value === 'string') {
    return (
      <td className={`${styles.fieldValue} ${styles.stringValue}`}>
        &quot;{value}&quot;
      </td>
    );
  }
  return (
    <td className={styles.fieldValue}>{String(value)}</td>
  );
}

interface DetailPanelProps {
  title: string;
  fields: Array<{ key: string; value: unknown }>;
}

export function DetailPanel({ title, fields }: DetailPanelProps) {
  return (
    <>
      <div className={styles.panelHeader}>
        <span>{title}</span>
      </div>
      <div className={styles.detailContent}>
        {fields.length === 0 ? (
          <div className={styles.placeholder}>Select an entry to view details</div>
        ) : (
          <table className={styles.detailTable}>
            <tbody>
              {fields.map(({ key, value }) => (
                <tr key={key}>
                  <td className={styles.fieldName}>{key}</td>
                  <FieldValue value={value} />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
