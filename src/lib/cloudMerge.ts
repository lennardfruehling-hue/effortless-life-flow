type Item = Record<string, any>;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Untouched local records never replace remote edits or deletions. */
export function mergeCloudArrays(remote: Item[], local: Item[], baseline: Item[] = []): Item[] {
  const before = new Map(baseline.map(x => [x.id, x]));
  const incoming = new Map(remote.map(x => [x.id, x]));
  const next = new Map(incoming);
  for (const item of local) {
    const old = before.get(item.id);
    if (old && equal(old, item)) continue;
    const other = incoming.get(item.id);
    if (other && old && !equal(old, other)) {
      const localTime = Date.parse(item.updatedAt || "") || 0;
      const remoteTime = Date.parse(other.updatedAt || "") || 0;
      if (!localTime || remoteTime >= localTime) continue;
    }
    next.set(item.id, item);
  }
  const ids = new Set(local.map(x => x.id));
  for (const old of baseline) {
    if (!ids.has(old.id) && equal(incoming.get(old.id), old)) next.delete(old.id);
  }
  return [...next.values()];
}
export function stampArrayChanges(value: unknown, previous: unknown, now = new Date().toISOString()): unknown {
  if (!Array.isArray(value) || !value.every(x => x && typeof x === "object" && typeof x.id === "string")) return value;
  const old = new Map((Array.isArray(previous) ? previous : []).map(x => [x.id, x]));
  return value.map(x => equal(x, old.get(x.id)) ? x : { ...x, updatedAt: now });
}