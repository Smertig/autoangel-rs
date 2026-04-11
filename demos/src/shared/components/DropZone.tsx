import React, { useRef, useState } from 'react';
import styles from './DropZone.module.css';

interface DropZoneProps {
  accept: string;
  multiple?: boolean;
  label: React.ReactNode;
  compact?: boolean;
  vertical?: boolean;   // column layout (text above input)
  onFiles: (files: File[]) => void;
}

export function DropZone({ accept, multiple, label, compact, vertical, onFiles }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(true);
  };

  const handleDragLeave = () => {
    setOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) {
      onFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length) {
      onFiles(Array.from(e.target.files));
    }
  };

  const className = [
    styles.dropZone,
    over ? styles.over : '',
    compact ? styles.compact : '',
    vertical ? styles.vertical : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      data-over={over ? 'true' : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <span className={styles.dropLabel}>{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className={styles.fileInput}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
