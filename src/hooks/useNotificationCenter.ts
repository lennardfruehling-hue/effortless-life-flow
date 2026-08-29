import { useEffect, useMemo, useState } from "react";
import { Task, Reminder, LifePlanProject } from "@/lib/types";
import { Habit } from "@/lib/habits";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { loadFlowState } from "@/lib/serpentFlowState";
import { loadCutoffs, onCutoffsChange, FlowCutoffs } from "@/lib/flowSettings";
import { computeGame } from "@/lib/consistencyGame";
import { weekKey } from "@/lib/pride";

export type NotifSeverity = "overdue" | "warn" | "info";
export type NotifKind =
  | "flow"
  | "task"
  | "reminder"
  | "consistency"
  | "weekly"
  | "project"
  | "assignment";

export interface UnifiedNotification {
  id: string;
  kind: NotifKind;
  label: string;
  detail?: string;
  severity: NotifSeverity;
  /** Condition-based items disappear on their own once the condition clears. */
  live: boolean;
  ts: number;
}

const DISMISS_KEY = "serpent-notif-dismissed-v1";

interface DismissMap { [id: string]: string } // id -> day it was dismissed on

function todayISO() { return new Date().toISOString().slice(0, 10); }
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function loadDismissed(): DismissMap {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}"); } catch { return {}; }
}
function saveDismissed(m: DismissMap) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(m)); } catch {}
}

function severityBefore(cutoff: string, hm: string): NotifSeverity | null {
  if (hm >= cutoff) return "overdue";
  const [ch, cm] = cutoff.split(":").map(Number);
  const [nh, nm] = hm.split(":").map(Number);
  if (ch * 60 + cm - (nh * 60 + nm) <= 60) return "warn";
  return null;
}

/**
 * Single source of truth for everything that shows up in the Notifications
 * section: Serpent flow alerts, overdue tasks/reminders, weekly intentions,
 * consistency habits, life-plan risk and assignments.
 *
 * Condition-based ("live") entries are recomputed continuously and disappear
 * automatically once their condition no longer holds. Assignments persist until
 * dismissed.
 */
export function useNotificationCenter(
  tasks: Task[],
  reminders: Reminder[] = [],
  lifePlanProjects: LifePlanProject[] = [],
) {
  const { notifications: assignments, dismiss: dismissAssignment, dismissAll: dismissAllAssignments } =
    useAssignmentNotifications(tasks);
  const [habits] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const [cutoffs, setCutoffs] = useState<FlowCutoffs>(() => loadCutoffs());
  const [dismissed, setDismissed] = useState<DismissMap>(loadDismissed);
  const [tick, setTick] = useState(0);

  useEffect(() => onCutoffsChange(setCutoffs), []);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const live = useMemo<UnifiedNotification[]>(() => {
    void tick;
    const out: UnifiedNotification[] = [];
    const now = new Date();
    const today = todayISO();
    const hm = nowHHMM();
    const flow = loadFlowState();
    const ts = now.getTime();

    // Serpent flow steps
    if (!flow.startCompleted) {
      const s = severityBefore(cutoffs.start, hm);
      if (s) out.push({ id: "flow-start", kind: "flow", severity: s, live: true, ts, label: s === "overdue" ? "Start Serpent overdue" : "Start Serpent due soon", detail: `By ${cutoffs.start}` });
    }
    if (flow.startCompleted && !flow.middayCompleted) {
      const s = severityBefore(cutoffs.midday, hm);
      if (s) out.push({ id: "flow-midday", kind: "flow", severity: s, live: true, ts, label: s === "overdue" ? "Midday Check overdue" : "Midday Check due soon", detail: `By ${cutoffs.midday}` });
    }
    if (!flow.eveningCompleted) {
      const s = severityBefore(cutoffs.evening, hm);
      if (s) out.push({ id: "flow-evening", kind: "flow", severity: s, live: true, ts, label: s === "overdue" ? "Evening Review overdue" : "Evening Review due soon", detail: `By ${cutoffs.evening}` });
    }

    // Overdue tasks
    for (const t of tasks || []) {
      if (t.completed) continue;
      if (t.dueTime && (!t.dueDate || t.dueDate === today)) {
        if (t.dueTime < hm) {
          out.push({ id: `task-${t.id}`, kind: t.recurrence === "daily" ? "consistency" : "task", severity: "overdue", live: true, ts, label: t.title, detail: `Due ${t.dueTime}` });
        }
      } else if (t.dueDate && t.dueDate < today) {
        out.push({ id: `task-${t.id}`, kind: "task", severity: "overdue", live: true, ts, label: t.title, detail: `Was due ${t.dueDate}` });
      }
    }

    // Overdue reminders
    for (const r of reminders || []) {
      if (r.completed) continue;
      if (new Date(r.datetime).getTime() <= now.getTime()) {
        out.push({ id: `rem-${r.id}`, kind: "reminder", severity: "overdue", live: true, ts, label: r.title, detail: `Was due ${new Date(r.datetime).toLocaleString()}` });
      }
    }

    // Weekly intentions still open
    const wk = weekKey();
    const weeklyOpen = (tasks || []).filter(
      (t) => t.recurrence === "weekly" && !t.completed && t.lastCompletedPeriod !== wk
    );
    if (weeklyOpen.length > 0) {
      out.push({
        id: "weekly-intentions",
        kind: "weekly",
        severity: now.getDay() >= 5 ? "overdue" : "warn",
        live: true,
        ts,
        label: `${weeklyOpen.length} weekly intention${weeklyOpen.length === 1 ? "" : "s"} not done yet`,
        detail: weeklyOpen.slice(0, 3).map((t) => t.title).join(" · "),
      });
    }

    // Consistency habits pending today
    const game = computeGame(habits || []);
    const pending = Math.max(0, game.today.due - game.today.completed);
    if (pending > 0) {
      out.push({
        id: "consistency-today",
        kind: "consistency",
        severity: now.getHours() >= 21 ? "overdue" : "warn",
        live: true,
        ts,
        label: `${pending} habit${pending === 1 ? "" : "s"} left to log today`,
        detail: `Streak ${game.streak}d · ${game.points.toLocaleString()} pts`,
      });
    }

    // Life-plan projects at risk
    for (const lp of lifePlanProjects || []) {
      const projTasks = (tasks || []).filter((t) => t.projectId === `lp-${lp.id}` && !t.completed);
      const overdueCount = projTasks.filter(
        (t) => (t.dueDate && t.dueDate < today) || (t.dueTime && (!t.dueDate || t.dueDate === today) && t.dueTime < hm)
      ).length;
      if (overdueCount > 0) {
        out.push({
          id: `proj-${lp.id}`,
          kind: "project",
          severity: overdueCount >= 3 ? "overdue" : "warn",
          live: true,
          ts,
          label: `${lp.name} at risk`,
          detail: `${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`,
        });
      }
    }

    return out;
  }, [tick, tasks, reminders, lifePlanProjects, habits, cutoffs]);

  const notifications = useMemo<UnifiedNotification[]>(() => {
    const day = todayISO();
    const assigned: UnifiedNotification[] = assignments.map((a) => ({
      id: a.id,
      kind: "assignment",
      label: a.label,
      detail: a.detail,
      severity: "info",
      live: false,
      ts: a.ts,
    }));
    const order: Record<NotifSeverity, number> = { overdue: 0, warn: 1, info: 2 };
    return [...live, ...assigned]
      .filter((n) => dismissed[n.id] !== day)
      .sort((a, b) => order[a.severity] - order[b.severity] || b.ts - a.ts);
  }, [live, assignments, dismissed]);

  const overdueCount = notifications.filter((n) => n.severity === "overdue").length;

  const dismiss = (id: string) => {
    const item = notifications.find((n) => n.id === id);
    if (item && !item.live) {
      dismissAssignment(id);
      return;
    }
    setDismissed((prev) => {
      const next = { ...prev, [id]: todayISO() };
      saveDismissed(next);
      return next;
    });
  };

  const dismissAll = () => {
    dismissAllAssignments();
    setDismissed((prev) => {
      const next = { ...prev };
      const day = todayISO();
      notifications.forEach((n) => { if (n.live) next[n.id] = day; });
      saveDismissed(next);
      return next;
    });
  };

  return { notifications, overdueCount, dismiss, dismissAll };
}
