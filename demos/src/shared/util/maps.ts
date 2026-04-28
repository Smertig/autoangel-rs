/** Push `v` into `m`'s bucket at `k`, creating the bucket if missing. */
export function pushTo<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const bucket = m.get(k);
  if (bucket) bucket.push(v);
  else m.set(k, [v]);
}
