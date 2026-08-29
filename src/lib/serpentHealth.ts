import { Task } from "./types";
import { Habit, todayISO, isHabitDue, isHabitCompleteOn } from "./habits";
import { overdueTasks, weeklyScore } from "./scoring";
import { getResetEpoch } from "./resetEpoch";

/**
 * Serpent Health — one number (0–100) for how well the system is actually being
 * run: what the user puts on the list vs. what actually gets completed, on time,
 * plus consistency logging. Measured over a rolling window from real inputs.
 */
export interface SerpentHealth {
  score: number;
  label: string;
  tone: "good" | "ok" | "warn";
  /** 0..1 of dated commitments completed on or before their date (30 days). */
  onTime: number;
  /** 0..1 of everything committed in the last 30 days that got completed. */
  completion: number;
  /** 0..1 of due habit-days logged complete in the last 14 days. */
  consistency: number;
  overdue: number;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgoISO(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return iso(d);
}

export function computeSerpentHealth(tasks: Task[], habits: Habit[]): SerpentHealth {
  const today = todayISO();
  const epoch = getResetEpoch();
  const from = daysAgoISO(30) > epoch ? daysAgoISO(30) : epoch;
  const list = tasks || [];

  // Completion: dated / recurring commitments in the window
  const scope = list.filter(
    (t) => (t.dueDate && t.dueDate >= from && t.dueDate <= today) || t.recurrence === "daily" || t.recurrence === "weekly"
  );
  const done = scope.filter(
    (t) => t.completed || (t.recurrence && t.lastCompletedPeriod && t.lastCompletedPeriod >= daysAgoISO(1))
  );
  const completion = scope.length > 0 ? done.length / scope.length : 1;

  // On time: dated tasks completed on or before their date
  const dated = list.filter((t) => t.dueDate && t.dueDate >= from && t.dueDate <= today);
  const onTimeCount = dated.filter(
    (t) => t.completed && (!t.completedAt || t.completedAt.slice(0, 10) <= (t.dueDate as string))
  ).length;
  const onTime = dated.length > 0 ? onTimeCount / dated.length : 1;

  // Consistency: due habit days logged complete over 14 days
  let due = 0;
  let hit = 0;
  for (let i = 0; i < 14; i++) {
    const d = daysAgoISO(i);
    if (d < epoch) continue;
    for (const h of habits || []) {
      if (!isHabitDue(h, d)) continue;
      due++;
      if (isHabitCompleteOn(h, d)) hit++;
    }
  }
  const consistency = due > 0 ? hit / due : 1;

  const overdue = overdueTasks(list).filter((t) => !t.dueDate || t.dueDate >= epoch).length;
  const week = weeklyScore(list);

  const raw =
    completion * 35 + onTime * 25 + consistency * 25 + Math.max(0, Math.min(1, week.progress)) * 15;
  const drag = Math.min(15, overdue * 1.5);
  const score = Math.max(0, Math.min(100, Math.round(raw - drag)));

  const tone: SerpentHealth["tone"] = score >= 75 ? "good" : score >= 50 ? "ok" : "warn";
  const label = score >= 90 ? "Excellent" : score >= 75 ? "Strong" : score >= 60 ? "Steady" : score >= 40 ? "Slipping" : "At risk";

  return { score, label, tone, onTime, completion, consistency, overdue };
}
