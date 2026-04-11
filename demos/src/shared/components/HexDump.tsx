import React from 'react';
import { hexDumpRows } from '@shared/util/hex';
import { formatSize } from '@shared/util/files';
import styles from './HexDump.module.css';

interface HexDumpProps {
  data: Uint8Array;
  maxBytes?: number;
}

export function HexDump({ data, maxBytes = 4096 }: HexDumpProps) {
  const rows = hexDumpRows(data, maxBytes);
  const truncated = data.byteLength > maxBytes;
  const remaining = data.byteLength - maxBytes;

  return (
    <div className={styles.hexDump}>
      {rows.map((row, i) => (
        <span key={i}>
          <span className={styles.hexOffset}>{row.offset}</span>
          {'  '}
          <span className={styles.hexBytes}>{row.hex}</span>
          {'  '}
          <span className={styles.hexAscii}>{row.ascii}</span>
          {'\n'}
        </span>
      ))}
      {truncated && (
        <span>
          {'\n'}
          <span className={styles.hexOffset}>... {formatSize(remaining)} more</span>
        </span>
      )}
    </div>
  );
}
