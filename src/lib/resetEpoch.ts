/**
 * Reset epoch — the date the Serpent system was zeroed.
 * Nothing before this date counts toward Serpent Health, the consistency game,
 * scoring history or streaks. Everything starts from here.
 */
const KEY = "serpent-reset-epoch";

/** Default epoch: the day the system was last reset to zero. */
export const DEFAULT_EPOCH = "2026-08-29";

export function getResetEpoch(): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw > DEFAULT_EPOCH) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_EPOCH;
}

/** Zero everything from the given date (defaults to today). */
export function setResetEpoch(dateISO?: string) {
  const d = dateISO || new Date().toISOString().slice(0, 10);
  try {
    localStorage.setItem(KEY, d);
    localStorage.removeItem("serpent-score-history");
  } catch {
    /* ignore */
  }
  return d;
}

/** True when a date is on/after the epoch and therefore counts. */
export function countsFromEpoch(dateISO: string): boolean {
  return dateISO >= getResetEpoch();
}
