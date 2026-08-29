import { Task } from "./types";
import { pridePointsForTask, todayKey, weekKey, startOfWeek } from "./pride";

/**
 * Serpent scoring system.
 *
 * Principles it encodes:
 * - Intention is what happens no matter what: a dated task MUST be completed.
 * - Once it's on the list it's non-negotiable: failing it costs pride points.
 *
 * Targets are set so that they are only reachable if the user completes
 * essentially everything he put on the list for that day / week.
 */

export const COMPLETION_BAR = 0.95; // 95% of the day's/week's potential must be earned

/** Points a task is *worth* (whether or not it is completed yet). */
export function potentialPoints(t: Task): number {
  return pridePointsForTask({ ...t, completed: true });
}

/** Points actually earned (completed only). */
export function earnedPoints(t: Task): number {
  return pridePointsForTask(t);
}

function daysAgo(iso: string): number {
  const a = new Date(iso + "T00:00:00");
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((+b - +a) / 86400000));
}

/** Penalty for a single failed / overdue commitment. Always a positive number. */
export function penaltyForTask(t: Task, today = todayKey()): number {
  if (t.completed) return 0;
  const worth = potentialPoints(t);

  // Missed recurring commitments
  if (t.recurrence === "daily") {
    const last = t.lastCompletedPeriod;
    const missed = last && last < today ? Math.min(7, daysAgo(last) - 1) : 0;
    return Math.round(worth * 0.5 * missed);
  }
  if (t.recurrence === "weekly") {
    const last = t.lastCompletedPeriod;
    if (last && last !== weekKey()) return Math.round(worth * 0.75);
    return 0;
  }

  // Dated one-off task past its date: escalating cost, capped at its own worth × 2
  if (t.dueDate && t.dueDate < today) {
    const late = daysAgo(t.dueDate);
    return Math.min(worth * 2, Math.round(worth * 0.25 * late) + 2);
  }
  return 0;
}

export interface ScoreSummary {
  /** points earned in the period */
  earned: number;
  /** points lost to broken commitments */
  penalty: number;
  /** earned - penalty */
  net: number;
  /** points the period is worth if everything committed is done */
  target: number;
  /** 0..1 net/target */
  progress: number;
  /** items counted as failed in this period */
  failed: number;
}

function isThisWeek(iso?: string): boolean {
  if (!iso) return false;
  return new Date(iso) >= startOfWeek(new Date());
}

/** Score of today: everything dated today + every daily recurring task. */
export function dailyScore(tasks: Task[]): ScoreSummary {
  const today = todayKey();
  const scope = (tasks || []).filter(
    (t) => t.recurrence === "daily" || t.dueDate === today || (!t.completed && t.dueDate && t.dueDate < today)
  );
  let earned = 0;
  let target = 0;
  let penalty = 0;
  let failed = 0;
  for (const t of scope) {
    target += potentialPoints(t);
    const doneToday =
      (t.recurrence === "daily" && t.completed && t.lastCompletedPeriod === today) ||
      (t.completed && t.completedAt?.slice(0, 10) === today);
    if (doneToday) earned += potentialPoints(t);
    const p = penaltyForTask(t, today);
    if (p > 0) {
      penalty += p;
      failed++;
    }
  }
  const bar = Math.round(target * COMPLETION_BAR);
  const net = earned - penalty;
  return { earned, penalty, net, target: bar, progress: bar > 0 ? Math.max(0, Math.min(1, net / bar)) : 0, failed };
}

/** Score of the current ISO week. Daily recurring tasks count once per remaining/elapsed day. */
export function weeklyScore(tasks: Task[]): ScoreSummary {
  const today = todayKey();
  const weekStart = startOfWeek(new Date());
  const weekEndISO = new Date(+weekStart + 6 * 86400000).toISOString().slice(0, 10);
  const weekStartISO = weekStart.toISOString().slice(0, 10);

  let earned = 0;
  let target = 0;
  let penalty = 0;
  let failed = 0;

  for (const t of tasks || []) {
    const worth = potentialPoints(t);
    if (t.recurrence === "daily") {
      target += worth * 7;
    } else if (t.recurrence === "weekly") {
      target += worth;
    } else if (t.dueDate && t.dueDate >= weekStartISO && t.dueDate <= weekEndISO) {
      target += worth;
    } else if (!t.completed && t.dueDate && t.dueDate < weekStartISO) {
      target += worth; // overdue debt still counts against the week
    }

    if (t.completed && isThisWeek(t.completedAt)) earned += worth;
    const p = penaltyForTask(t, today);
    if (p > 0) {
      penalty += p;
      failed++;
    }
  }

  const bar = Math.round(target * COMPLETION_BAR);
  const net = earned - penalty;
  return { earned, penalty, net, target: bar, progress: bar > 0 ? Math.max(0, Math.min(1, net / bar)) : 0, failed };
}

/** Tasks whose date is coming up and must be completed. */
export function upcomingDeadlines(tasks: Task[], withinDays = 3): Task[] {
  const today = todayKey();
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  const limitISO = limit.toISOString().slice(0, 10);
  return (tasks || [])
    .filter((t) => !t.completed && t.dueDate && t.dueDate >= today && t.dueDate <= limitISO)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
}

export function overdueTasks(tasks: Task[]): Task[] {
  const today = todayKey();
  return (tasks || []).filter((t) => !t.completed && t.dueDate && t.dueDate < today);
}

// ===== Reward target (weekly, resettable) =====

const HISTORY_KEY = "serpent-score-history"; // weekKey -> { net, target, met }

export interface WeekRecord {
  net: number;
  target: number;
  met: boolean;
}

export function loadScoreHistory(): Record<string, WeekRecord> {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
  } catch {
    return {};
  }
}

export function recordWeek(summary: ScoreSummary): Record<string, WeekRecord> {
  const hist = loadScoreHistory();
  hist[weekKey()] = { net: summary.net, target: summary.target, met: summary.target > 0 && summary.net >= summary.target };
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  } catch {
    /* ignore */
  }
  return hist;
}

/** Reset all reward progress (targets start again from zero). */
export function resetRewardProgress() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

export const REWARD = {
  title: "Ionian Islands · Sea-kayak & Sail",
  /** Weeks that must be *fully met* to earn the reward. */
  weeks: 26,
};

/** Reward progress: only weeks where the target was met count. */
export function rewardProgress(current: ScoreSummary): { weeksMet: number; progress: number; streak: number } {
  const hist = loadScoreHistory();
  hist[weekKey()] = {
    net: current.net,
    target: current.target,
    met: current.target > 0 && current.net >= current.target,
  };
  const keys = Object.keys(hist).sort();
  const weeksMet = keys.filter((k) => hist[k].met).length;
  let streak = 0;
  for (let i = keys.length - 1; i >= 0; i--) {
    if (hist[keys[i]].met) streak++;
    else break;
  }
  return { weeksMet, progress: Math.min(1, weeksMet / REWARD.weeks), streak };
}
