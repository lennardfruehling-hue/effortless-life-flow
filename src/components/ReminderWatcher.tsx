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

/** Snake hiss: filtered white noise with a slow swell. */
function scheduleHiss(ctx: AudioContext, start: number, duration: number) {
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  // Bandpass-ish: highpass + lowpass to make it sssss-like
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3500;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 9000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.55, start + 0.15);
  g.gain.setValueAtTime(0.55, start + duration - 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ctx.destination);
  src.start(start);
  src.stop(start + duration);
}

/** Single typewriter key: short noise click + mechanical thunk. */
function scheduleTypeKey(ctx: AudioContext, start: number) {
  // click (short noise burst)
  const dur = 0.04;
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2200;
  bp.Q.value = 4;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start(start);
  src.stop(start + dur);

  // mechanical thunk (low square thump)
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(180, start);
  o.frequency.exponentialRampToValueAtTime(80, start + 0.05);
  og.gain.setValueAtTime(0.0001, start);
  og.gain.exponentialRampToValueAtTime(0.4, start + 0.005);
  og.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);
  o.connect(og); og.connect(ctx.destination);
  o.start(start);
  o.stop(start + 0.1);
}

/** Plays a long, repetitive snake-hiss + typewriter alarm (~10s). */
function playAlarm(audioCtxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    const start = ctx.currentTime;

    // 4 cycles of: hiss (1.6s) + 6 typewriter keys (~0.9s) = ~2.5s each → ~10s total
    const cycleLen = 2.5;
    const cycles = 4;
    for (let c = 0; c < cycles; c++) {
      const t0 = start + c * cycleLen;
      scheduleHiss(ctx, t0, 1.6);
      // typewriter run at end of cycle
      for (let k = 0; k < 6; k++) {
        scheduleTypeKey(ctx, t0 + 1.55 + k * 0.13);
      }
      // carriage-return ding at end of last cycle
      if (c === cycles - 1) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 1760;
        g.gain.setValueAtTime(0.0001, t0 + 2.4);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + 2.42);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.0);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0 + 2.4);
        o.stop(t0 + 3.05);
      }
    }
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
