import { useEffect, useRef } from "react";
import { Task } from "@/lib/types";
import { loadNotificationSettings, onNotificationSettingsChange, NotificationSettings } from "@/lib/notificationSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { weekKey } from "@/lib/pride";

/**
 * Watches weekly recurring tasks (Weekly Intentions) and warns + emails the
 * user when, past the user-configured warning threshold for the current week,
 * any are still not completed.
 *
 * - Polls every 5 minutes (and on mount).
 * - Each (task, week) only triggers once, tracked in localStorage.
 * - Email is dispatched via the existing `reminder-email` edge function
 *   when the user has opted in via NotificationSettings.
 */

const SENT_KEY = "serpent-weekly-intention-warned-v1";

function loadSent(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SENT_KEY) || "{}"); } catch { return {}; }
}
function markSent(taskId: string, wk: string) {
  const m = loadSent();
  m[taskId] = wk;
  localStorage.setItem(SENT_KEY, JSON.stringify(m));
}

function pastThreshold(s: NotificationSettings): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day < s.weeklyWarningStartDay) return false;
  if (day === s.weeklyWarningStartDay && now.getHours() < s.weeklyWarningHour) return false;
  return true;
}

export default function WeeklyIntentionWatcher({ tasks }: { tasks: Task[] }) {
  const settingsRef = useRef<NotificationSettings>(loadNotificationSettings());
  const tasksRef = useRef<Task[]>(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    return onNotificationSettingsChange((s) => { settingsRef.current = s; });
  }, []);

  useEffect(() => {
    const check = async () => {
      const s = settingsRef.current;
      const wk = weekKey();
      const sent = loadSent();
      const weekly = tasksRef.current.filter(
        (t) => t.recurrence === "weekly" && !t.completed && t.lastCompletedPeriod !== wk
      );
      if (weekly.length === 0) return;
      if (!pastThreshold(s)) return;

      const pending = weekly.filter((t) => sent[t.id] !== wk);
      if (pending.length === 0) return;

      // In-app warning
      toast.warning(
        `⚠ ${pending.length} weekly intention${pending.length === 1 ? "" : "s"} not done yet`,
        { description: pending.slice(0, 3).map((t) => `• ${t.title}`).join("\n"), duration: 10000 }
      );
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("⚠ Weekly intentions pending", {
          body: pending.map((t) => t.title).join(", "),
        });
      }

      // Email (if opted in)
      if (s.emailEnabled && s.emailWeeklyIntentions) {
        try {
          const { data: u } = await supabase.auth.getUser();
          const email = s.targetEmail || u.user?.email;
          if (email) {
            const title = `⚠ Weekly intentions pending (${pending.length})`;
            const body = pending.map((t) => `• ${t.title}`).join("\n");
            await supabase.functions.invoke("reminder-email", {
              body: { email, title, datetime: new Date().toISOString(), detail: body },
            });
          }
        } catch (e) {
          console.warn("weekly-intention email failed", e);
        }
      }

      pending.forEach((t) => markSent(t.id, wk));
    };

    check();
    const id = window.setInterval(check, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
