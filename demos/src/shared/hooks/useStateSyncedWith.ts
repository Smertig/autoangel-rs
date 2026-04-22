import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Local state that mirrors a prop but can diverge between prop changes.
 * When `propValue` changes, local state resets to it; local setters in between
 * are kept until the next external change.
 */
export function useStateSyncedWith<T>(propValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(propValue);
  const [lastProp, setLastProp] = useState<T>(propValue);
  if (propValue !== lastProp) {
    setLastProp(propValue);
    setValue(propValue);
  }
  return [value, setValue];
}
