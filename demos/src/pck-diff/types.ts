export const DiffStatus = {
  ADDED: 'added',
  DELETED: 'deleted',
  MODIFIED: 'modified',
  UNCHANGED: 'unchanged',
  PENDING: 'pending',
} as const;

export type DiffStatusValue = typeof DiffStatus[keyof typeof DiffStatus];

export interface SideState {
  loaded: boolean;
  fileName: string | null;
  files: string[] | null;
}

export interface StatusCounts {
  added: number;
  deleted: number;
  modified: number;
  unchanged: number;
  pending: number;
}
