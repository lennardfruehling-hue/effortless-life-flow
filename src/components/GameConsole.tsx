import { useEffect, useMemo, useState } from "react";
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
import { buildConsistencyNudges, computeGame } from "@/lib/consistencyGame";
import { IONIAN_GOAL } from "@/lib/pride";
import {
  Gamepad2, Trophy, Flame, Gift, ChevronDown, ChevronUp, Target, Sparkles,
  Check, X, Undo2, AlertTriangle,
} from "lucide-react";

interface Goal { title: string; weeks: number; subtitle: string }

const SKIP_KEY = "serpent-consistency-skips-v1";
/** Hour after which unlogged habits start flashing. */
const FLASH_AFTER_HOUR = 21;

function loadSkips(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(SKIP_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Game console — the single place to play today's consistency round: goal
 * status, every habit due today (checkable), streak, reward reminder and tips.
 */
export default function GameConsole() {
  const [habits, setHabits, loaded] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const [goal] = useCloudState<Goal>(CLOUD_KEYS.consistencyGoal, {
    title: IONIAN_GOAL.title,
    weeks: IONIAN_GOAL.weeks,
    subtitle: "Every consistent day brings the boat closer.",
  });
  const [open, setOpen] = useState(() => localStorage.getItem("serpent-game-console-open") !== "false");
  const [skips, setSkips] = useState<Record<string, string[]>>(loadSkips);

  useEffect(() => {
    try { localStorage.setItem(SKIP_KEY, JSON.stringify(skips)); } catch { /* ignore */ }
  }, [skips]);

  const toggleOpen = () =>
    setOpen((v) => {
      try { localStorage.setItem("serpent-game-console-open", (!v).toString()); } catch { /* ignore */ }
      return !v;
    });

  const list = habits || [];
  const today = todayISO();
  // Retroactive logging: 0 = today, 1 = yesterday, …
  const [dayOffset, setDayOffset] = useState(0);
  const date = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    return todayISO(d);
  }, [dayOffset]);
  const isToday = dayOffset === 0;
  const dayLabel = isToday
    ? "Today"
    : dayOffset === 1
      ? "Yesterday"
      : new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const game = useMemo(() => computeGame(list, goal.weeks || 26), [list, goal.weeks]);
  const nudges = useMemo(() => buildConsistencyNudges(list, game), [list, game]);

  const due = useMemo(() => list.filter((h) => isHabitDue(h, date)), [list, date]);
  const skippedToday = skips[date] ?? [];
  const doneHabits = due.filter((h) => isHabitCompleteOn(h, date));
  const pending = due.filter((h) => !isHabitCompleteOn(h, date) && !skippedToday.includes(h.id));
  const missed = due.filter((h) => !isHabitCompleteOn(h, date) && skippedToday.includes(h.id));

  const markDone = (h: Habit) => {
    const slots = h.times.length > 0 ? h.times : ["any"];
    setSkips((prev) => ({ ...prev, [date]: (prev[date] ?? []).filter((id) => id !== h.id) }));
    setHabits((prev) => (prev || []).map((x) => (x.id === h.id ? { ...x, log: { ...x.log, [date]: slots } } : x)));
  };
  const undo = (h: Habit) => {
    setSkips((prev) => ({ ...prev, [date]: (prev[date] ?? []).filter((id) => id !== h.id) }));
    setHabits((prev) => (prev || []).map((x) => (x.id === h.id ? { ...x, log: { ...x.log, [date]: [] } } : x)));
  };
  const toggleSlot = (h: Habit, slot: string) =>
    setHabits((prev) => (prev || []).map((x) => (x.id === h.id ? toggleHabitSlot(x, date, slot) : x)));
  const markMissed = (h: Habit) =>
    setSkips((prev) => ({ ...prev, [date]: [...(prev[date] ?? []), h.id] }));

  if (!loaded) return null;

  const pct = Math.round(game.progress * 100);
  const remainingPts = Math.max(0, game.datePotential - game.datePoints);
  const toWin = Math.max(0, game.target - game.points);
  const allAnswered = pending.length === 0;
  const flashing = !allAnswered && new Date().getHours() >= FLASH_AFTER_HOUR;

  return (
    <section
      className={`rounded-xl border overflow-hidden transition-colors ${
        flashing
          ? "border-destructive/50 bg-destructive/10 animate-pulse"
          : "border-primary/25 bg-gradient-to-br from-primary/10 via-card to-cat-h/5"
      }`}
    >
      <button onClick={toggleOpen} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        {flashing ? (
          <AlertTriangle size={15} className="text-destructive shrink-0" />
        ) : (
          <Gamepad2 size={15} className="text-primary shrink-0" />
        )}
        <span className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Game console</span>
        <span className="ml-auto flex items-center gap-2 text-[11px] font-mono tabular-nums">
          <span className="text-muted-foreground">{doneHabits.length}/{due.length}</span>
          <span className="text-primary font-semibold">{pct}%</span>
          <span className="flex items-center gap-0.5 text-cat-c"><Flame size={11} />{game.streak}</span>
          {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* Goal status */}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                <Trophy size={12} className="text-cat-b shrink-0" /> {goal.title}
              </p>
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
                {game.points.toLocaleString()}/{game.target.toLocaleString()} pts
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Lv {game.level} {game.levelName} · ×{game.multiplier.toFixed(2)} · {toWin.toLocaleString()} pts to win
            </p>
          </div>

          {/* Today's consistency round — every habit, checkable */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground flex items-center gap-1">
              <Target size={10} />
              {allAnswered ? `Round logged · +${game.datePoints} pts` : `Today's round · +${remainingPts} pts left`}
            </p>

            {due.length === 0 ? (
              <p className="text-[11px] text-muted-foreground mt-1">
                No habits scheduled date — add some in Consistency to start scoring.
              </p>
            ) : (
              <div className="mt-1.5 space-y-1">
                {pending.map((h) => {
                  const doneSlots = h.log[date] ?? [];
                  const need = requiredCount(h);
                  const slots = h.times.length ? h.times : ["any"];
                  return (
                    <div key={h.id} className="rounded-lg bg-background/80 border border-border px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{h.emoji || "🔁"}</span>
                        <span className="text-[12px] text-foreground flex-1 truncate">{h.name}</span>
                        {need > 1 && (
                          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{doneSlots.length}/{need}</span>
                        )}
                        <button onClick={() => markDone(h)} title="Completed date" className="p-1 rounded-md text-emerald-600 hover:bg-emerald-500/10">
                          <Check size={14} />
                        </button>
                        <button onClick={() => markMissed(h)} title="Not done date" className="p-1 rounded-md text-muted-foreground hover:bg-secondary">
                          <X size={14} />
                        </button>
                      </div>
                      {need > 1 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {slots.map((s) => {
                            const on = doneSlots.includes(s);
                            return (
                              <button
                                key={s}
                                onClick={() => toggleSlot(h, s)}
                                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono border ${
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

                {missed.map((h) => (
                  <div key={h.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                    <span className="text-sm opacity-60">{h.emoji || "🔁"}</span>
                    <span className="text-[12px] text-muted-foreground flex-1 truncate">{h.name}</span>
                    <button onClick={() => markDone(h)} title="Actually done" className="p-1 rounded-md text-emerald-600 hover:bg-emerald-500/10">
                      <Check size={14} />
                    </button>
                  </div>
                ))}

                {doneHabits.map((h) => (
                  <div key={h.id} className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-2 py-1.5">
                    <span className="text-sm">{h.emoji || "🔁"}</span>
                    <span className="text-[12px] text-emerald-700 flex-1 truncate line-through">{h.name}</span>
                    <button onClick={() => undo(h)} title="Undo / edit" className="p-1 rounded-md text-muted-foreground hover:bg-secondary">
                      <Undo2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reward reminder + tips */}
          <div className="rounded-lg bg-muted/50 border border-border p-2 space-y-1.5">
            <p className="text-[11px] text-foreground flex items-start gap-1.5">
              <Gift size={11} className="text-cat-b mt-0.5 shrink-0" />
              <span>{goal.subtitle}</span>
            </p>
            {nudges.slice(0, 2).map((n) => (
              <p
                key={n.id}
                className={`text-[10px] flex items-start gap-1.5 ${
                  n.tone === "warn" ? "text-cat-c" : n.tone === "good" ? "text-cat-a" : "text-muted-foreground"
                }`}
              >
                <Sparkles size={10} className="mt-0.5 shrink-0" />
                <span><span className="font-medium">{n.title}.</span> {n.detail}</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
