import { useMemo, useState } from "react";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { Habit, todayISO, isHabitDue, requiredCount, toggleHabitSlot, isHabitCompleteOn } from "@/lib/habits";
import { computeGame, PERFECT_DAY_BONUS, POINTS_PER_SLOT, HABIT_COMPLETE_BONUS, PERFECT_WEEK_BONUS } from "@/lib/consistencyGame";
import { Trophy, Flame, Sparkles, Star, Gift, Check } from "lucide-react";

interface Props {
  /** Reward horizon in weeks (from the consistency goal). */
  weeks?: number;
  rewardTitle?: string;
}

/**
 * The Consistency Game — reward-only points, levels, streak multipliers and an
 * editable, traceable log of today's habits.
 */
export default function ConsistencyGame({ weeks = 26, rewardTitle = "Your reward" }: Props) {
  const [habits, setHabits, loaded] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const today = todayISO();
  const [dayOffset, setDayOffset] = useState(0);

  const viewDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - dayOffset);
    return d.toISOString().slice(0, 10);
  }, [dayOffset]);

  const game = useMemo(() => computeGame(habits || [], weeks), [habits, weeks]);
  const due = useMemo(
    () => (habits || []).filter((h) => isHabitDue(h, viewDate)),
    [habits, viewDate]
  );

  const toggle = (h: Habit, slot: string) =>
    setHabits((prev) => (prev || []).map((x) => (x.id === h.id ? toggleHabitSlot(x, viewDate, slot) : x)));

  const completeAll = (h: Habit) =>
    setHabits((prev) =>
      (prev || []).map((x) =>
        x.id === h.id ? { ...x, log: { ...x.log, [viewDate]: x.times.length ? [...x.times] : ["any"] } } : x
      )
    );

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      {/* Score board */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/10 via-card to-cat-h/5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground flex items-center gap-1.5">
              <Sparkles size={12} className="text-primary" /> Consistency game
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold font-mono text-primary tabular-nums">{game.points.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">pts</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Level {game.level} · {game.levelName}
              {game.pointsToNextLevel > 0 && ` · ${game.pointsToNextLevel} to next`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Chip icon={<Flame size={13} className="text-cat-f" />} label="streak" value={`${game.streak}d`} />
            <Chip icon={<Star size={13} className="text-cat-h" />} label="multiplier" value={`×${game.multiplier.toFixed(2)}`} />
          </div>
        </div>

        {/* Reward bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span className="flex items-center gap-1.5"><Gift size={12} className="text-primary" /> {rewardTitle}</span>
            <span className="font-mono">{game.points.toLocaleString()} / {game.target.toLocaleString()}</span>
          </div>
          <div className="h-3 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-cat-h transition-all"
              style={{ width: `${Math.round(game.progress * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {Math.round(game.progress * 100)}% unlocked · target assumes near-perfect consistency over {weeks} weeks.
          </p>
        </div>

        {/* Level bar */}
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.round(game.levelProgress * 100)}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <Mini label="Today" value={`+${game.todayPoints}`} sub={`of +${game.todayPotential}`} />
          <Mini label="This week" value={`+${game.weekPoints}`} sub={`${game.weekPerfect}/7 perfect`} />
          <Mini label="Perfect days" value={`${game.perfectDays}`} sub={`best ${game.bestStreak}d`} />
        </div>
      </div>

      {/* Today's habits — traceable & editable */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Trophy size={14} className="text-primary" />
            {dayOffset === 0 ? "Today's habits" : `Habits · ${viewDate}`}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDayOffset((d) => d + 1)}
              className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-secondary"
            >
              ← earlier
            </button>
            <button
              onClick={() => setDayOffset((d) => Math.max(0, d - 1))}
              disabled={dayOffset === 0}
              className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              later →
            </button>
          </div>
        </div>

        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">No habits scheduled for this day.</p>
        ) : (
          <ul className="space-y-2">
            {due.map((h) => {
              const slots = h.times.length ? h.times : ["any"];
              const doneSlots = h.log[viewDate] ?? [];
              const complete = isHabitCompleteOn(h, viewDate);
              const earned =
                Math.min(requiredCount(h), doneSlots.length) * POINTS_PER_SLOT +
                (complete ? HABIT_COMPLETE_BONUS : 0);
              return (
                <li
                  key={h.id}
                  className={`rounded-lg border px-3 py-2 ${complete ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{h.emoji || "🔁"}</span>
                    <span className={`text-sm flex-1 truncate ${complete ? "text-emerald-700" : "text-foreground"}`}>{h.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">+{earned}</span>
                    {!complete && (
                      <button
                        onClick={() => completeAll(h)}
                        title="Mark all slots done"
                        className="p-1 rounded-md text-emerald-600 hover:bg-emerald-500/10"
                      >
                        <Check size={15} />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {slots.map((s) => {
                      const on = doneSlots.includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggle(h, s)}
                          className={`px-2 py-1 rounded-md text-[11px] font-mono border transition-colors ${
                            on
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700"
                              : "border-border bg-card text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          {s === "any" ? "done" : s} {on ? "✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground mt-3">
          {POINTS_PER_SLOT} pts per logged slot · +{HABIT_COMPLETE_BONUS} per habit finished · +{PERFECT_DAY_BONUS} perfect day · +{PERFECT_WEEK_BONUS} perfect week. Points are never taken away.
        </p>
      </section>

      {/* 30-day trail */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Last 30 days</h3>
        <div className="flex items-end gap-1 h-20">
          {game.last30.map((d) => {
            const max = Math.max(1, ...game.last30.map((x) => x.points));
            const h = Math.max(3, Math.round((d.points / max) * 72));
            return (
              <div
                key={d.date}
                title={`${d.date} · ${d.points} pts${d.perfect ? " · perfect" : ""}`}
                className={`flex-1 rounded-sm ${d.perfect ? "bg-primary" : d.points > 0 ? "bg-primary/50" : "bg-muted/50"}`}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Chip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-center">
      <div className="flex items-center gap-1 justify-center text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        {icon} {label}
      </div>
      <div className="text-sm font-bold font-mono text-foreground">{value}</div>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{label}</div>
      <div className="text-lg font-bold font-mono text-foreground leading-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
