import type { Task } from "./types";
import { todayKey, weekKey } from "./pride";
export function setTaskCompleted(task: Task, completed: boolean, now = new Date()): Task {
  return { ...task, completed, completedAt: completed ? now.toISOString() : undefined,
    lastCompletedPeriod: task.recurrence && completed ? (task.recurrence === "weekly" ? weekKey(now) : todayKey(now)) : task.lastCompletedPeriod };
}