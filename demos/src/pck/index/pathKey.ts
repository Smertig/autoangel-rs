/** Canonical lookup key: case-insensitive, separator-agnostic,
 *  leading-separator-tolerant. Idempotent. Shared between the main
 *  thread and the index worker so both agree on lookup identity. */
export function normalizePathKey(p: string): string {
  return p.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
}
