import React from 'react';
import { formatSize } from '@shared/util/files';
import styles from '../App.module.css';

interface BinaryDiffProps {
  leftData: Uint8Array;
  rightData: Uint8Array;
  path: string;
}

interface HexRegionProps {
  data: Uint8Array;
  start: number;
  maxBytes: number;
  highlightOffset: number;
  label: string;
}

function HexRegion({ data, start, maxBytes, highlightOffset, label }: HexRegionProps) {
  const end = Math.min(start + maxBytes, data.byteLength);
  const lines: React.ReactNode[] = [];

  for (let i = start; i < end; i += 16) {
    const chunk = data.subarray(i, Math.min(i + 16, end));
    const offset = i.toString(16).padStart(8, '0');
    const hexParts: React.ReactNode[] = [];
    const asciiParts: React.ReactNode[] = [];

    for (let j = 0; j < 16; j++) {
      const sep = j > 0 ? ' ' : '';
      if (j < chunk.length) {
        const byteOffset = i + j;
        const isHighlight = byteOffset >= highlightOffset && byteOffset < highlightOffset + 16;
        const hex = chunk[j].toString(16).padStart(2, '0');
        const ch = chunk[j] >= 0x20 && chunk[j] <= 0x7e ? String.fromCharCode(chunk[j]) : '.';
        if (isHighlight) {
          hexParts.push(sep);
          hexParts.push(<span key={j} className={styles.hexHighlight}>{hex}</span>);
          asciiParts.push(<span key={j} className={styles.hexHighlight}>{ch}</span>);
        } else {
          hexParts.push(sep + hex);
          asciiParts.push(ch);
        }
      } else {
        hexParts.push(sep + '  ');
        asciiParts.push(' ');
      }
    }

    lines.push(
      <span key={i}>
        <span className={styles.hexOffset}>{offset}</span>
        {'  '}
        {hexParts}
        {'  '}
        {asciiParts}
        {'\n'}
      </span>
    );
  }

  return (
    <div className={styles.hexRegion}>
      <div className={styles.hexRegionLabel}>{label}</div>
      <div className={styles.hexDump}>{lines}</div>
    </div>
  );
}

export function BinaryDiff({ leftData, rightData, path }: BinaryDiffProps) {
  const oldSize = leftData.byteLength;
  const newSize = rightData.byteLength;
  const delta = newSize - oldSize;
  const pct = oldSize > 0 ? ((delta / oldSize) * 100).toFixed(1) : '\u221E';
  const sign = delta >= 0 ? '+' : '';

  // Find first differing byte
  const minLen = Math.min(oldSize, newSize);
  let firstDiff = -1;
  for (let i = 0; i < minLen; i++) {
    if (leftData[i] !== rightData[i]) { firstDiff = i; break; }
  }
  if (firstDiff === -1 && oldSize !== newSize) firstDiff = minLen;

  const contextBytes = 32;
  const showBytes = 128;
  const start = firstDiff >= 0 ? (Math.max(0, firstDiff - contextBytes) & ~0xF) : 0;

  return (
    <>
      <div className={styles.binarySizeCard}>
        <div className={styles.sizeRow}>
          <span className={styles.sizeLabel}>Old:</span>
          <span>{formatSize(oldSize)}</span>
        </div>
        <div className={styles.sizeRow}>
          <span className={styles.sizeLabel}>New:</span>
          <span>{formatSize(newSize)}</span>
        </div>
        <div className={styles.sizeRow}>
          <span className={styles.sizeLabel}>Delta:</span>
          <span>{sign}{formatSize(Math.abs(delta))} ({sign}{pct}%)</span>
        </div>
      </div>

      {firstDiff >= 0 && (
        <div className={styles.binaryHexDiff}>
          <div className={styles.hexDiffTitle}>
            First difference at offset 0x{firstDiff.toString(16).toUpperCase().padStart(8, '0')}
          </div>
          <HexRegion
            data={leftData}
            start={start}
            maxBytes={showBytes}
            highlightOffset={firstDiff}
            label="Old"
          />
          <HexRegion
            data={rightData}
            start={start}
            maxBytes={showBytes}
            highlightOffset={firstDiff}
            label="New"
          />
        </div>
      )}
    </>
  );
}
