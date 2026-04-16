import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, MouseEvent, RefObject } from 'react';

interface UseFileDropOptions {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
}

interface UseFileDropResult {
  /** True while a drag is hovering the target. */
  over: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Spread on the outer drop target element. */
  dragProps: {
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
  /** Spread on the hidden `<input type="file">`. */
  inputProps: {
    ref: RefObject<HTMLInputElement | null>;
    type: 'file';
    multiple: boolean;
    accept?: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClick: (e: MouseEvent<HTMLInputElement>) => void;
  };
  /** Programmatically open the OS file picker (e.g. from an outer button click). */
  triggerPicker: () => void;
}

/**
 * Shared drop-target plumbing: tracks hover state, bridges the hidden file
 * input with drag-and-drop so both funnel through the same `onFiles`
 * callback, and suppresses spurious `dragleave` events when the pointer
 * merely traverses descendant nodes.
 */
export function useFileDrop({ onFiles, multiple = false, accept }: UseFileDropOptions): UseFileDropResult {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    // Ignore leave events caused by entering a descendant (text spans, inputs).
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      if (e.dataTransfer.files.length) {
        onFiles(Array.from(e.dataTransfer.files));
      }
    },
    [onFiles],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length) {
        onFiles(Array.from(e.target.files));
      }
      // Clear so re-selecting the same file fires `change` again.
      e.target.value = '';
    },
    [onFiles],
  );

  const onClick = useCallback((e: MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
  }, []);

  const triggerPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return {
    over,
    inputRef,
    dragProps: { onDragOver, onDragLeave, onDrop },
    inputProps: { ref: inputRef, type: 'file', multiple, accept, onChange, onClick },
    triggerPicker,
  };
}
