import { Habit, isHabitDue, isHabitCompleteOn, requiredCount, todayISO } from "./habits";
import { getResetEpoch } from "./resetEpoch";

/**
 * Consistency Game — a reward-only scoring system.
 * Every consistent day earns points that move a real-world reward target closer.
 * There are no penalties: missing a day simply earns nothing and cools the streak
 * multiplier, it never subtracts points already banked.
 */

export const POINTS_PER_SLOT = 10;
export const HABIT_COMPLETE_BONUS = 5;
export const PERFECT_DAY_BONUS = 25;
/** Extra bonus for a fully perfect week (7/7 perfect days). */
export const PERFECT_WEEK_BONUS = 100;
/** Multiplier grows 2% per streak day, capped. */
export const STREAK_STEP = 0.02;
export const MAX_MULTIPLIER = 1.6;
/** Target assumes this share of perfect days is required to win the reward. */
export const TARGET_CONSISTENCY = 0.95;

export interface DayResult {
  date: string;
  due: number;
  completed: number;
  slotsDone: number;
  perfect: boolean;
  basePoints: number;
  multiplier: number;
  points: number;
}

export interface GameStats {
  /** Total banked points across history. */
  points: number;
  /** Points earned today. */
  todayPoints: number;
  /** Max points still achievable today. */
  todayPotential: number;
  streak: number;
  bestStreak: number;
  multiplier: number;
  /** Points needed to unlock the reward. */
  target: number;
  progress: number; // 0..1
  level: number;
  levelName: string;
  levelProgress: number; // 0..1 within current level
  pointsToNextLevel: number;
  perfectDays: number;
  last30: DayResult[];
  today: DayResult;
  /** Perfect days in the current calendar week (Mon-based). */
  weekPerfect: number;
  weekPoints: number;
}

export const LEVELS = [
  "Spark",
  "Ember",
  "Kindling",
  "Steady Flame",
  "Torchbearer",
  "Beacon",
  "Lighthouse",
  "Wildfire",
  "Sunkeeper",
  "Serpent Ascendant",
];

export const LEVEL_SIZE = 500;

export function levelFor(points: number) {
  const idx = Math.min(LEVELS.length - 1, Math.floor(points / LEVEL_SIZE));
  const floor = idx * LEVEL_SIZE;
  const next = (idx + 1) * LEVEL_SIZE;
  const capped = idx === LEVELS.length - 1;
  return {
    level: idx + 1,
    levelName: LEVELS[idx],
    levelProgress: capped ? 1 : (points - floor) / LEVEL_SIZE,
    pointsToNextLevel: capped ? 0 : Math.max(0, next - points),
  };
}

function isoOffset(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function multiplierFor(streak: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + streak * STREAK_STEP);
}

/** Raw (pre-multiplier) potential of a date: what a perfect day is worth. */
export function dayPotential(habits: Habit[], dateISO: string): number {
  const due = habits.filter((h) => isHabitDue(h, dateISO));
  if (due.length === 0) return 0;
  const slots = due.reduce((s, h) => s + requiredCount(h), 0);
  return slots * POINTS_PER_SLOT + due.length * HABIT_COMPLETE_BONUS + PERFECT_DAY_BONUS;
}

export function evaluateDay(habits: Habit[], dateISO: string, streakBefore: number): DayResult {
  const due = habits.filter((h) => isHabitDue(h, dateISO));
  const slotsDone = due.reduce(
    (s, h) => s + Math.min(requiredCount(h), h.log[dateISO]?.length ?? 0),
    0
  );
  const completed = due.filter((h) => isHabitCompleteOn(h, dateISO)).length;
  const perfect = due.length > 0 && completed === due.length;
  const basePoints =
    slotsDone * POINTS_PER_SLOT +
    completed * HABIT_COMPLETE_BONUS +
    (perfect ? PERFECT_DAY_BONUS : 0);
  const multiplier = multiplierFor(streakBefore);
  return {
    date: dateISO,
    due: due.length,
    completed,
    slotsDone,
    perfect,
    basePoints,
    multiplier,
    points: Math.round(basePoints * multiplier),
  };
}

/**
 * Compute the whole game state from habit logs.
 * @param weeks the reward horizon (from the consistency goal).
 */
export function computeGame(habits: Habit[], weeks = 26, historyDays = 180): GameStats {
  const list = habits || [];
  const today = todayISO();
  let points = 0;
  let streak = 0;
  let bestStreak = 0;
  let perfectDays = 0;
  const results: DayResult[] = [];

  const epoch = getResetEpoch();
  for (let i = historyDays - 1; i >= 0; i--) {
    const iso = isoOffset(i);
    // Nothing before the reset epoch counts — the system starts from zero there.
    const due = iso < epoch ? [] : list.filter((h) => isHabitDue(h, iso));
    if (due.length === 0) {
      results.push({ date: iso, due: 0, completed: 0, slotsDone: 0, perfect: false, basePoints: 0, multiplier: multiplierFor(streak), points: 0 });
      continue;
    }
    const res = evaluateDay(list, iso, streak);
    points += res.points;
    if (res.perfect) {
      perfectDays++;
      streak++;
      if (streak > bestStreak) bestStreak = streak;
    } else if (iso !== today) {
      streak = 0;
    }
    results.push(res);
  }

  // Perfect-week bonuses (rolling calendar weeks inside the history window)
  for (let i = 0; i + 7 <= results.length; i += 7) {
    const chunk = results.slice(i, i + 7).filter((r) => r.due > 0);
    if (chunk.length > 0 && chunk.every((r) => r.perfect)) points += PERFECT_WEEK_BONUS;
  }

  const todayRes = results[results.length - 1] ?? {
    date: today, due: 0, completed: 0, slotsDone: 0, perfect: false, basePoints: 0, multiplier: 1, points: 0,
  };

  const potentialToday = Math.round(dayPotential(list, today) * todayRes.multiplier);

  // Realistic reward target: perfect days at TARGET_CONSISTENCY over the horizon.
  const avgPerfect =
    list.length === 0
      ? 0
      : Math.round(
          Array.from({ length: 7 }, (_, k) => dayPotential(list, isoOffset(-k))).reduce((a, b) => a + b, 0) / 7
        );
  const days = Math.max(1, weeks * 7);
  const target = Math.max(
    500,
    Math.round(avgPerfect * days * TARGET_CONSISTENCY * 1.15 + (weeks * PERFECT_WEEK_BONUS * TARGET_CONSISTENCY))
  );

  const last7 = results.slice(-7);
  const lvl = levelFor(points);

  return {
    points,
    todayPoints: todayRes.points,
    todayPotential: potentialToday,
    streak,
    bestStreak,
    multiplier: multiplierFor(streak),
    target,
    progress: Math.min(1, points / target),
    perfectDays,
    last30: results.slice(-30),
    today: todayRes,
    weekPerfect: last7.filter((r) => r.perfect).length,
    weekPoints: last7.reduce((s, r) => s + r.points, 0),
    ...lvl,
  };
}

export interface GameNudge {
  id: string;
  tone: "info" | "warn" | "good";
  title: string;
  detail: string;
}

/** Reward-framed guidance for the command center. */
export function buildConsistencyNudges(habits: Habit[], game: GameStats, now = new Date()): GameNudge[] {
  const out: GameNudge[] = [];
  const hour = now.getHours();
  const remaining = Math.max(0, game.todayPotential - game.todayPoints);
  const pending = game.today.due - game.today.completed;

  if (game.today.due === 0) {
    out.push({
      id: "cg-none",
      tone: "info",
      title: "No habits scheduled today",
      detail: "Add a habit in Consistency to start earning points toward your reward.",
    });
    return out;
  }

  if (game.today.perfect) {
    out.push({
      id: "cg-perfect",
      tone: "good",
      title: `Perfect day — +${game.today.points} pts banked`,
      detail: `Streak ${game.streak} day${game.streak === 1 ? "" : "s"} · multiplier ×${game.multiplier.toFixed(2)}. Tomorrow keeps it climbing.`,
    });
  } else {
    out.push({
      id: "cg-open",
      tone: hour >= 20 ? "warn" : "info",
      title: `${pending} habit${pending === 1 ? "" : "s"} left · +${remaining} pts on the table`,
      detail:
        hour >= 20
          ? "Late in the day — finish what you can and log it so the streak multiplier survives."
          : `Logging them all makes today a perfect day (+${PERFECT_DAY_BONUS} bonus at ×${game.multiplier.toFixed(2)}).`,
    });
  }

  if (game.streak >= 3 && !game.today.perfect) {
    out.push({
      id: "cg-streak",
      tone: "warn",
      title: `Protect your ${game.streak}-day streak`,
      detail: `Your multiplier is ×${game.multiplier.toFixed(2)}. A perfect day today pushes it to ×${Math.min(MAX_MULTIPLIER, 1 + (game.streak + 1) * STREAK_STEP).toFixed(2)}.`,
    });
  }

  if (game.weekPerfect >= 5 && game.weekPerfect < 7) {
    out.push({
      id: "cg-week",
      tone: "info",
      title: `${7 - game.weekPerfect} perfect day${7 - game.weekPerfect === 1 ? "" : "s"} from a perfect week`,
      detail: `A full week adds a +${PERFECT_WEEK_BONUS} pt bonus straight onto the reward bar.`,
    });
  }

  const pctLeft = Math.max(0, game.target - game.points);
  out.push({
    id: "cg-target",
    tone: "info",
    title: `${Math.round(game.progress * 100)}% to the reward`,
    detail: `${pctLeft.toLocaleString()} pts to go · level ${game.level} ${game.levelName}${game.pointsToNextLevel ? ` (${game.pointsToNextLevel} to next level)` : ""}.`,
  });

  return out;
}
