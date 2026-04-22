// Ambient declarations for the File System Access API surface that TypeScript's
// lib.dom.d.ts hasn't fully landed yet. Only what we actually call.
//
// Spec: https://wicg.github.io/file-system-access/

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

type PermissionState = 'granted' | 'denied' | 'prompt';

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DataTransferItem {
  /** Chromium-only. Returns null for items that aren't files. */
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface Window {
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
