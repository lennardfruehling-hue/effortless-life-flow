export type HabitFrequency = "daily" | "bi-daily" | "weekly" | "custom";

export interface Habit {
  id: string;
  name: string;
  emoji?: string;
  frequency: HabitFrequency;
  /** For custom frequency: 0=Sun … 6=Sat. */
  weekdays?: number[];
  /** For weekly: single anchor weekday 0-6. */
  weeklyDay?: number;
  /** For bi-daily: ISO date the cycle starts from (YYYY-MM-DD). */
  cycleStart?: string;
  /** Times of day (HH:MM 24h). Empty = any time. */
  times: string[];
  /** Extra notes. */
  notes?: string;
  createdAt: string;
  /** Completion log per date: dateISO -> array of completed time slot keys ("any" or "HH:MM"). */
  log: Record<string, string[]>;
  /** When true, mirror this habit into the to-do list even if no times are set. */
  pushedToTasks?: boolean;
}

export function todayISO(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO + "T00:00:00");
  const b = new Date(bISO + "T00:00:00");
  return Math.round((+b - +a) / 86400000);
}

/** Should a habit be active on a given date? */
export function isHabitDue(h: Habit, dateISO: string): boolean {
  const d = new Date(dateISO + "T00:00:00");
  const dow = d.getDay();
  switch (h.frequency) {
    case "daily":
      return true;
    case "bi-daily": {
      const start = h.cycleStart || h.createdAt.slice(0, 10);
      const diff = daysBetween(start, dateISO);
      return diff >= 0 && diff % 2 === 0;
    }
    case "weekly":
      return (h.weeklyDay ?? 1) === dow;
    case "custom":
      return (h.weekdays ?? []).includes(dow);
  }
}

/** Required completion count for this habit on this date (# of time slots, min 1). */
export function requiredCount(h: Habit): number {
  return Math.max(1, h.times.length);
}

/** Is habit fully complete on dateISO? */
export function isHabitCompleteOn(h: Habit, dateISO: string): boolean {
  if (!isHabitDue(h, dateISO)) return false;
  const done = h.log[dateISO]?.length ?? 0;
  return done >= requiredCount(h);
}

/** Streak of consecutive due-days completed ending today (skips non-due days). */
export function habitStreak(h: Habit): number {
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (!isHabitDue(h, iso)) continue;
    if (isHabitCompleteOn(h, iso)) streak++;
    else break;
  }
  return streak;
}

export function habitBestStreak(h: Habit, days = 365): number {
  let best = 0;
  let run = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (!isHabitDue(h, iso)) continue;
    if (isHabitCompleteOn(h, iso)) {
      run++;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
}

/** Toggle completion of a slot ("any" or "HH:MM") on a date. */
export function toggleHabitSlot(h: Habit, dateISO: string, slot: string): Habit {
  const cur = new Set(h.log[dateISO] ?? []);
  if (cur.has(slot)) cur.delete(slot);
  else cur.add(slot);
  return { ...h, log: { ...h.log, [dateISO]: Array.from(cur) } };
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
