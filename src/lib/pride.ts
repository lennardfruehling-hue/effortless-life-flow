import { Task } from "./types";

/**
 * Pride score — only counts tasks marked makesProud=true.
 * Curve: longer tasks reward disproportionately more.
 *   Base: 1pt per 3 minutes (15min => 5pts).
 *   Bonus: ×1.25 if duration > 30min, ×1.6 if > 60min, ×2 if > 120min.
 */
export function pridePointsForTask(t: Task): number {
  if (!t.makesProud || !t.completed) return 0;
  const minutes = t.duration && t.duration > 0 ? t.duration : 15;
  const base = minutes / 3;
  let mult = 1;
  if (minutes > 120) mult = 2;
  else if (minutes > 60) mult = 1.6;
  else if (minutes > 30) mult = 1.25;
  return Math.round(base * mult);
}

export function totalPride(tasks: Task[]): number {
  return tasks.reduce((sum, t) => sum + pridePointsForTask(t), 0);
}

export function prideThisWeek(tasks: Task[]): number {
  const start = startOfWeek(new Date());
  return tasks.reduce((sum, t) => {
    if (!t.completedAt) return sum;
    if (new Date(t.completedAt) < start) return sum;
    return sum + pridePointsForTask(t);
  }, 0);
}

// ===== Period helpers for recurring tasks =====
export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function weekKey(d = new Date()): string {
  // ISO week id: YYYY-Www
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+tmp - +yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - (day - 1));
  return x;
}

/** Reset recurring tasks whose period has rolled over. */
export function applyRecurrenceReset(tasks: Task[]): { tasks: Task[]; changed: boolean } {
  const dayK = todayKey();
  const weekK = weekKey();
  let changed = false;
  const out = tasks.map((t) => {
    if (!t.recurrence || !t.completed) return t;
    const period = t.recurrence === "daily" ? dayK : weekK;
    if (t.lastCompletedPeriod && t.lastCompletedPeriod !== period) {
      changed = true;
      return { ...t, completed: false, completedAt: undefined };
    }
    return t;
  });
  return { tasks: out, changed };
}

/** Streaks across the last N days for daily-recurring tasks. */
export interface ConsistencyStats {
  currentStreak: number;
  bestStreak: number;
  daily: { date: string; done: number; total: number }[]; // last 90 days
}

export function computeConsistency(tasks: Task[]): ConsistencyStats {
  const dailyTasks = tasks.filter((t) => t.recurrence === "daily");
  const days = 90;
  const daily: { date: string; done: number; total: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build per-day completion. We approximate "done that day" via completedAt date.
  // Total = number of daily tasks that existed by that date.
  const byDate: Record<string, number> = {};
  for (const t of dailyTasks) {
    if (t.completedAt) {
      const k = t.completedAt.slice(0, 10);
      byDate[k] = (byDate[k] || 0) + 1;
    }
    // also today if currently completed
    if (t.completed && t.lastCompletedPeriod) {
      byDate[t.lastCompletedPeriod] = (byDate[t.lastCompletedPeriod] || 0) + 1;
    }
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    daily.push({ date: k, done: byDate[k] || 0, total: dailyTasks.length });
  }

  // streak: walk back from today; a day counts if done >= total (and total>0).
  let currentStreak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    const d = daily[i];
    if (d.total > 0 && d.done >= d.total) currentStreak++;
    else break;
  }
  let bestStreak = 0;
  let run = 0;
  for (const d of daily) {
    if (d.total > 0 && d.done >= d.total) {
      run++;
      if (run > bestStreak) bestStreak = run;
    } else run = 0;
  }
  return { currentStreak, bestStreak, daily };
}

/** Goal: Ionian sea-kayak/sail trip, 1 year out. Progress = streak-weeks / 52. */
export const IONIAN_GOAL = {
  title: "Ionian Islands · Sea-kayak & Sail",
  weeks: 52,
};

export function ionianProgress(stats: ConsistencyStats): number {
  // Each 7-day perfect run = 1 week of progress.
  const perfectDays = stats.daily.filter((d) => d.total > 0 && d.done >= d.total).length;
  return Math.min(1, perfectDays / (IONIAN_GOAL.weeks * 7));
}
