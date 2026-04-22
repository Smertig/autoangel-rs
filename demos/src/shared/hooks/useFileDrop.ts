import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, MouseEvent, RefObject } from 'react';

/**
 * A picked or dropped file plus an optional `FileSystemFileHandle` from the
 * File System Access API. The handle is present only when the browser
 * supports the API and the file came in via `showOpenFilePicker` or a drag
 * carrying a `getAsFileSystemHandle`-capable item — i.e. Chromium-family
 * browsers. In other browsers the handle is always undefined.
 */
export interface PickedItem {
  file: File;
  handle?: FileSystemFileHandle;
}

interface UseFileDropOptions {
  onFiles: (items: PickedItem[]) => void;
  multiple?: boolean;
  /**
   * Restricts file picker / drop accepted extensions. For `<input>` it's a
   * comma-separated list. For `showOpenFilePicker`, leave empty (the picker's
   * structured `types[]` is harder to compose; we just use no filter).
   */
  accept?: string;
}

interface UseFileDropResult {
  over: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  dragProps: {
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
  inputProps: {
    ref: RefObject<HTMLInputElement | null>;
    type: 'file';
    multiple: boolean;
    accept?: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClick: (e: MouseEvent<HTMLInputElement>) => void;
  };
  triggerPicker: () => void;
}

/** Type guard: `FileSystemHandle.kind === 'file'`. */
function isFileHandle(h: FileSystemHandle): h is FileSystemFileHandle {
  return h.kind === 'file';
}

/**
 * Shared drop-target plumbing: tracks hover state, and for both drop and
 * picker funnels into `onFiles` as `PickedItem[]`. On Chromium the items
 * carry a `FileSystemFileHandle` so callers can persist it for one-click
 * reopen; on other browsers the handle is undefined and reopen falls back
 * to a fresh `<input type="file">` prompt.
 */
export function useFileDrop({ onFiles, multiple = false, accept }: UseFileDropOptions): UseFileDropResult {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const dt = e.dataTransfer;
      // `getAsFileSystemHandle` must be invoked *synchronously* — the
      // DataTransferItem only lives until the drop task finishes, so calling
      // it after any await loses the handle on Chrome.
      const items = Array.from(dt.items).filter((it) => it.kind === 'file');
      const files = Array.from(dt.files);
      const hasHandleApi =
        items.length > 0 && typeof items[0]?.getAsFileSystemHandle === 'function';
      const handlePromises = hasHandleApi
        ? items.map((it) => it.getAsFileSystemHandle?.() ?? Promise.resolve(null))
        : [];
      void (async () => {
        const pickedItems: PickedItem[] = [];
        if (hasHandleApi) {
          const settled = await Promise.all(
            handlePromises.map(async (p, idx): Promise<PickedItem | null> => {
              const handle = await p.catch(() => null);
              if (handle && isFileHandle(handle)) {
                try {
                  return { file: await handle.getFile(), handle };
                } catch {
                  // Permission lost between drop and read — fall through.
                }
              }
              const plain = files[idx];
              return plain ? { file: plain } : null;
            }),
          );
          for (const item of settled) if (item) pickedItems.push(item);
        }
        if (pickedItems.length === 0) {
          for (const f of files) pickedItems.push({ file: f });
        }
        if (pickedItems.length > 0) onFiles(pickedItems);
      })();
    },
    [onFiles],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length) {
        onFiles(Array.from(e.target.files).map((file) => ({ file })));
      }
      e.target.value = '';
    },
    [onFiles],
  );

  const onClick = useCallback((e: MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
  }, []);

  const triggerPicker = useCallback(() => {
    // Call `showOpenFilePicker` synchronously on the click — secure-context
    // APIs consume transient user activation, and an async detour can drop
    // it. Falls back to `<input type="file">` when the API is unavailable.
    const picker =
      typeof window.showOpenFilePicker === 'function'
        ? window.showOpenFilePicker({ multiple })
        : null;
    if (picker === null) {
      inputRef.current?.click();
      return;
    }
    void (async () => {
      try {
        const handles = await picker;
        const picked = await Promise.all(
          handles.map(async (handle) => ({ file: await handle.getFile(), handle })),
        );
        if (picked.length > 0) onFiles(picked);
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;
        console.warn('showOpenFilePicker failed; falling back to <input>:', e);
        inputRef.current?.click();
      }
    })();
  }, [multiple, onFiles]);

  return {
    over,
    inputRef,
    dragProps: { onDragOver, onDragLeave, onDrop },
    inputProps: { ref: inputRef, type: 'file', multiple, accept, onChange, onClick },
    triggerPicker,
  };
}

