import type { FieldRow } from '../fieldPanel';
import { BoolDot } from '../formatters';

/** Build one BoolDot row per defined flag. Skips undefined entries so callers
 *  can feed an object literal whose values may be missing on the body. */
export function flagRows(flags: Record<string, boolean | undefined>): FieldRow[] {
  return Object.entries(flags)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({ label: k, value: <BoolDot on={!!v} /> }));
}
