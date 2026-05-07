import { useEffect, useRef } from "react";
import { Reminder } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reminder watcher.
 * - Polls reminders every 15s.
 * - When a reminder is due (and not completed/fired), plays a loud alarm + browser notification.
 * - Sends an email to the signed-in user via the `reminder-email` edge function.
 * - Marks reminder as fired in localStorage so it doesn't re-fire across tabs/refreshes.
 */
const FIRED_KEY = "serpent-fired-reminders";

function getFired(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || "{}");
  } catch {
    return {};
  }
}

function markFired(id: string, period: string) {
  const f = getFired();
  f[id] = period;
  localStorage.setItem(FIRED_KEY, JSON.stringify(f));
}

function periodKey(r: Reminder): string {
  // For recurring, the period changes each occurrence so we can re-fire.
  const d = new Date(r.datetime);
  if (r.recurring === "daily") return `${r.id}-${new Date().toISOString().slice(0, 10)}`;
  if (r.recurring === "weekly") {
    const wk = new Date();
    const day = wk.getDay();
    wk.setDate(wk.getDate() - day);
    return `${r.id}-${wk.toISOString().slice(0, 10)}`;
  }
  if (r.recurring === "monthly") return `${r.id}-${new Date().toISOString().slice(0, 7)}`;
  return `${r.id}-${d.toISOString()}`;
}

/** Plays a loud, attention-grabbing alarm using Web Audio (no asset needed). */
function playAlarm(audioCtxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    // 4 alternating beeps at high volume
    const now = ctx.currentTime;
    const freqs = [880, 660, 880, 660];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.value = 0.001;
      o.connect(g);
      g.connect(ctx.destination);
      const t = now + i * 0.45;
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.start(t);
      o.stop(t + 0.42);
    });
  } catch (e) {
    console.warn("alarm failed", e);
  }
}

export default function ReminderWatcher({
  reminders,
  onUpdate,
}: {
  reminders: Reminder[];
  onUpdate: (r: Reminder[]) => void;
}) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    // ask for notification permission once
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const check = async () => {
      const now = Date.now();
      const fired = getFired();
      let changed = false;
      const next = [...reminders];

      for (const r of reminders) {
        if (r.completed) continue;
        const due = new Date(r.datetime).getTime();
        if (due > now) continue;
        const key = periodKey(r);
        if (fired[r.id] === key) continue; // already fired this occurrence

        // Fire
        markFired(r.id, key);
        playAlarm(audioCtxRef);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("⏰ Reminder", { body: r.title, requireInteraction: true });
        }

        // Send email (best effort)
        try {
          const { data: u } = await supabase.auth.getUser();
          const email = u.user?.email;
          if (email) {
            await supabase.functions.invoke("reminder-email", {
              body: { email, title: r.title, datetime: r.datetime },
            });
          }
        } catch (e) {
          console.warn("reminder email failed", e);
        }

        // For non-recurring, mark completed in state.
        if (!r.recurring) {
          const idx = next.findIndex((x) => x.id === r.id);
          if (idx >= 0) {
            next[idx] = { ...next[idx], completed: true };
            changed = true;
          }
        }
      }

      if (changed) onUpdate(next);
    };

    // initial + interval
    check();
    tickRef.current = window.setInterval(check, 15000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [reminders, onUpdate]);

  return null;
}
