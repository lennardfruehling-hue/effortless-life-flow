import { Habit } from "./habits";
import { Task, Reminder, Category } from "./types";
import { cloudGet, cloudSet, CLOUD_KEYS } from "./cloudStore";
import { store } from "./store";

const HABIT_PREFIX = "habit-";

function slotKey(habit: Habit, slot: string) {
  return `${habit.id}:${slot}`;
}

function nextDatetimeForTime(time: string, weeklyDay?: number): string {
  const [hh, mm] = time.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setSeconds(0, 0);
  target.setHours(hh, mm, 0, 0);
  if (typeof weeklyDay === "number") {
    const diff = (weeklyDay - target.getDay() + 7) % 7;
    target.setDate(target.getDate() + diff);
    if (diff === 0 && target < now) target.setDate(target.getDate() + 7);
  } else if (target < now) {
    target.setDate(target.getDate() + 1);
  }
  return target.toISOString();
}

interface Desired {
  habitId: string;
  title: string;
  dueTime?: string;
  recurrence: "daily" | "weekly";
  weeklyDay?: number;
  hasTime: boolean;
}

function buildDesired(habits: Habit[]): Desired[] {
  const out: Desired[] = [];
  for (const h of habits) {
    const recurrence: "daily" | "weekly" = h.frequency === "weekly" ? "weekly" : "daily";
    const title = `${h.emoji ? h.emoji + " " : ""}${h.name}`;
    if (h.times && h.times.length > 0) {
      for (const t of h.times) {
        out.push({
          habitId: slotKey(h, t),
          title,
          dueTime: t,
          recurrence,
          weeklyDay: recurrence === "weekly" ? h.weeklyDay ?? 1 : undefined,
          hasTime: true,
        });
      }
    } else if (h.pushedToTasks) {
      // No time slot — mirror as a plain to-do (any time).
      out.push({
        habitId: slotKey(h, "any"),
        title,
        recurrence,
        weeklyDay: recurrence === "weekly" ? h.weeklyDay ?? 1 : undefined,
        hasTime: false,
      });
    }
  }
  return out;
}

/**
 * Sync habit time-slots into personal tasks + reminders. Idempotent.
 * - Adds missing entries.
 * - Updates title/time/recurrence in place.
 * - Removes any auto-generated entries whose habit or slot no longer exists.
 */
export async function syncHabitsToTasksAndReminders(userId: string, habits: Habit[]): Promise<void> {
  const desired = buildDesired(habits);
  const desiredById = new Map(desired.map((d) => [d.habitId, d]));

  // ---- Tasks (cloud, personal) ----
  const tasks = await cloudGet<Task[]>(userId, CLOUD_KEYS.tasks, []);
  const nowIso = new Date().toISOString();
  const nextTasks: Task[] = [];
  const seenHabits = new Set<string>();

  for (const t of tasks) {
    if (t.habitId) {
      if (!desiredById.has(t.habitId)) continue; // slot gone → drop
      const d = desiredById.get(t.habitId)!;
      nextTasks.push({
        ...t,
        title: d.title,
        dueTime: d.dueTime,
        recurrence: d.recurrence,
      });
      seenHabits.add(t.habitId);
    } else {
      nextTasks.push(t);
    }
  }
  for (const d of desired) {
    if (seenHabits.has(d.habitId)) continue;
    nextTasks.push({
      id: `${HABIT_PREFIX}${d.habitId}`,
      title: d.title,
      categories: ["G"] as Category[],
      completed: false,
      createdAt: nowIso,
      dueTime: d.dueTime,
      recurrence: d.recurrence,
      createdBy: userId,
      habitId: d.habitId,
    });
  }
  await cloudSet(userId, CLOUD_KEYS.tasks, nextTasks);

  // ---- Reminders (localStorage) — only for slots with an actual time. ----
  const desiredTimed = desired.filter((d) => d.hasTime);
  const desiredTimedById = new Map(desiredTimed.map((d) => [d.habitId, d]));
  const reminders = store.getReminders();
  const seenRem = new Set<string>();
  const nextRem: Reminder[] = [];
  for (const r of reminders) {
    if (r.habitId) {
      if (!desiredTimedById.has(r.habitId)) continue;
      const d = desiredTimedById.get(r.habitId)!;
      nextRem.push({
        ...r,
        title: d.title,
        datetime: nextDatetimeForTime(d.dueTime!, d.weeklyDay),
        recurring: d.recurrence,
        completed: false,
      });
      seenRem.add(r.habitId);
    } else {
      nextRem.push(r);
    }
  }
  for (const d of desiredTimed) {
    if (seenRem.has(d.habitId)) continue;
    nextRem.push({
      id: `${HABIT_PREFIX}rem-${d.habitId}`,
      title: d.title,
      datetime: nextDatetimeForTime(d.dueTime!, d.weeklyDay),
      recurring: d.recurrence,
      completed: false,
      habitId: d.habitId,
    });
  }
  store.saveReminders(nextRem);
  // Nudge Index.tsx storage listener so reminders state refreshes.
  window.dispatchEvent(new StorageEvent("storage", { key: "serpent-reminders" }));
}
