import { useMemo, useState, useEffect } from "react";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import {
  Habit,
  todayISO,
  isHabitDue,
  isHabitCompleteOn,
  requiredCount,
  toggleHabitSlot,
} from "@/lib/habits";
import { computeGame } from "@/lib/consistencyGame";
import { Flame, Check, X, AlertTriangle, ChevronDown, ChevronRight, Sparkles, Undo2 } from "lucide-react";

const SKIP_KEY = "serpent-consistency-skips-v1";
/** Hour of day after which unanswered consistency tasks start flashing. */
const FLASH_AFTER_HOUR = 21;


function loadSkips(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(SKIP_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Daily prompt asking the user to confirm whether each consistency (habit) task
 * was completed today, framed as the day's move in the consistency game.
 */
export default function ConsistencyPrompt() {
  const [habits, setHabits, loaded] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const today = todayISO();
  const [skips, setSkips] = useState<Record<string, string[]>>(loadSkips);
  const [open, setOpen] = useState(false);


  useEffect(() => {
    try { localStorage.setItem(SKIP_KEY, JSON.stringify(skips)); } catch { /* ignore */ }
  }, [skips]);

  const skippedToday = skips[today] ?? [];

  const due = useMemo(
    () => (habits || []).filter((h) => isHabitDue(h, today)),
    [habits, today]
  );

  const game = useMemo(() => computeGame(habits || []), [habits]);

  const pending = due.filter(
    (h) => !isHabitCompleteOn(h, today) && !skippedToday.includes(h.id)
  );
  const doneHabits = due.filter((h) => isHabitCompleteOn(h, today));

  const markDone = (h: Habit) => {
    const slots = h.times.length > 0 ? h.times : ["any"];
    setHabits((prev) =>
      (prev || []).map((x) =>
        x.id === h.id ? { ...x, log: { ...x.log, [today]: slots } } : x
      )
    );
  };

  const undo = (h: Habit) =>
    setHabits((prev) => (prev || []).map((x) => (x.id === h.id ? { ...x, log: { ...x.log, [today]: [] } } : x)));

  const toggleSlot = (h: Habit, slot: string) =>
    setHabits((prev) => (prev || []).map((x) => (x.id === h.id ? toggleHabitSlot(x, today, slot) : x)));

  const markMissed = (h: Habit) =>
    setSkips((prev) => ({ ...prev, [today]: [...(prev[today] ?? []), h.id] }));

  if (!loaded || due.length === 0) return null;

  const allAnswered = pending.length === 0;
  const doneCount = doneHabits.length;
  const flashing = !allAnswered && new Date().getHours() >= FLASH_AFTER_HOUR;
  const remaining = Math.max(0, game.todayPotential - game.todayPoints);

  return (
    <div
      className={`mb-4 rounded-xl border transition-colors ${
        allAnswered
          ? "border-emerald-500/30 bg-emerald-500/5"
          : flashing
          ? "border-destructive/50 bg-destructive/10 animate-pulse"
          : "border-border bg-card"
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        {allAnswered ? (
          <Flame size={14} className="text-emerald-600" />
        ) : (
          <AlertTriangle size={14} className={flashing ? "text-destructive" : "text-muted-foreground"} />
        )}
        <h2
          className={`text-sm font-semibold ${
            allAnswered ? "text-emerald-700" : flashing ? "text-destructive" : "text-foreground"
          }`}
        >
          {allAnswered ? `Consistency logged · +${game.todayPoints} pts` : `Play today's consistency round · +${remaining} pts left`}
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
          <Sparkles size={11} className="text-primary" />×{game.multiplier.toFixed(2)} · {doneCount}/{due.length}
        </span>
      </button>

      {open && (
      <div className="px-3 pb-3 space-y-1.5">
        {pending.map((h) => {
          const doneSlots = h.log[today] ?? [];
          const need = requiredCount(h);
          const slots = h.times.length ? h.times : ["any"];
          return (
            <div
              key={h.id}
              className="rounded-lg bg-background/80 border border-border px-2.5 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{h.emoji || "🔁"}</span>
                <span className="text-sm text-foreground flex-1 truncate">{h.name}</span>
                {need > 1 && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {doneSlots.length}/{need}
                  </span>
                )}
                <button
                  onClick={() => markDone(h)}
                  title="Completed today"
                  className="p-1 rounded-md text-emerald-600 hover:bg-emerald-500/10"
                >
                  <Check size={15} />
                </button>
                <button
                  onClick={() => markMissed(h)}
                  title="Not done today"
                  className="p-1 rounded-md text-muted-foreground hover:bg-secondary"
                >
                  <X size={15} />
                </button>
              </div>
              {need > 1 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {slots.map((s) => {
                    const on = doneSlots.includes(s);
                    return (
                      <button
                        key={s}
                        onClick={() => toggleSlot(h, s)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                          on ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700" : "border-border text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        {s === "any" ? "done" : s} {on ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {doneHabits.map((h) => (
          <div key={h.id} className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5">
            <span className="text-sm">{h.emoji || "🔁"}</span>
            <span className="text-sm text-emerald-700 flex-1 truncate line-through">{h.name}</span>
            <button
              onClick={() => undo(h)}
              title="Undo / edit"
              className="p-1 rounded-md text-muted-foreground hover:bg-secondary"
            >
              <Undo2 size={14} />
            </button>
          </div>
        ))}

        <p className="text-[11px] text-muted-foreground pt-1">
          {allAnswered
            ? `Perfect day banked. Streak ${game.streak}d · ${game.points.toLocaleString()} pts toward your reward.`
            : `Finish them all for the perfect-day bonus at ×${game.multiplier.toFixed(2)}. Points are only ever added.`}
        </p>
      </div>
      )}
    </div>
  );
}
