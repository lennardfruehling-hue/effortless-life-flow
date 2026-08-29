import { useMemo, useState, useEffect } from "react";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import {
  Habit,
  todayISO,
  isHabitDue,
  isHabitCompleteOn,
  requiredCount,
} from "@/lib/habits";
import { Flame, Check, X, AlertTriangle } from "lucide-react";

const SKIP_KEY = "serpent-consistency-skips-v1";

function loadSkips(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(SKIP_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Daily prompt asking the user to confirm whether each consistency (habit) task
 * was completed today. Flashes red while answers are still missing.
 */
export default function ConsistencyPrompt() {
  const [habits, setHabits, loaded] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const today = todayISO();
  const [skips, setSkips] = useState<Record<string, string[]>>(loadSkips);

  useEffect(() => {
    try { localStorage.setItem(SKIP_KEY, JSON.stringify(skips)); } catch { /* ignore */ }
  }, [skips]);

  const skippedToday = skips[today] ?? [];

  const due = useMemo(
    () => (habits || []).filter((h) => isHabitDue(h, today)),
    [habits, today]
  );

  const pending = due.filter(
    (h) => !isHabitCompleteOn(h, today) && !skippedToday.includes(h.id)
  );

  const markDone = (h: Habit) => {
    const slots = h.times.length > 0 ? h.times : ["any"];
    setHabits((prev) =>
      (prev || []).map((x) =>
        x.id === h.id ? { ...x, log: { ...x.log, [today]: slots } } : x
      )
    );
  };

  const markMissed = (h: Habit) =>
    setSkips((prev) => ({ ...prev, [today]: [...(prev[today] ?? []), h.id] }));

  if (!loaded || due.length === 0) return null;

  const allAnswered = pending.length === 0;
  const doneCount = due.filter((h) => isHabitCompleteOn(h, today)).length;

  return (
    <div
      className={`mb-4 rounded-xl border p-3 transition-colors ${
        allAnswered
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-destructive/50 bg-destructive/10 animate-pulse"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {allAnswered ? (
          <Flame size={14} className="text-emerald-600" />
        ) : (
          <AlertTriangle size={14} className="text-destructive" />
        )}
        <h2
          className={`text-sm font-semibold ${
            allAnswered ? "text-emerald-700" : "text-destructive"
          }`}
        >
          {allAnswered ? "Consistency logged for today" : "Log your consistency tasks"}
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">
          {doneCount}/{due.length}
        </span>
      </div>

      {allAnswered ? (
        <p className="text-xs text-muted-foreground">
          All {due.length} consistency task{due.length === 1 ? "" : "s"} answered. Keep the streak alive.
        </p>
      ) : (
        <div className="space-y-1.5">
          {pending.map((h) => {
            const done = h.log[today]?.length ?? 0;
            const need = requiredCount(h);
            return (
              <div
                key={h.id}
                className="flex items-center gap-2 rounded-lg bg-background/80 border border-border px-2.5 py-1.5"
              >
                <span className="text-sm">{h.emoji || "🔁"}</span>
                <span className="text-sm text-foreground flex-1 truncate">{h.name}</span>
                {need > 1 && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {done}/{need}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
