import { useMemo, useState } from "react";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { Habit, todayISO, isHabitDue, isHabitCompleteOn } from "@/lib/habits";
import { buildConsistencyNudges, computeGame } from "@/lib/consistencyGame";
import { IONIAN_GOAL } from "@/lib/pride";
import { Gamepad2, Trophy, Flame, Gift, ChevronDown, ChevronUp, Target, Sparkles } from "lucide-react";

interface Goal { title: string; weeks: number; subtitle: string }

/**
 * Compact game console shown above the daily calendar: goal status, the
 * priority steps to win today, streak, reward reminder and winning tips.
 */
export default function GameConsole() {
  const [habits] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const [goal] = useCloudState<Goal>(CLOUD_KEYS.consistencyGoal, {
    title: IONIAN_GOAL.title,
    weeks: IONIAN_GOAL.weeks,
    subtitle: "Every consistent day brings the boat closer.",
  });
  const [open, setOpen] = useState(() => localStorage.getItem("serpent-game-console-open") !== "false");

  const toggle = () => {
    setOpen((v) => {
      try { localStorage.setItem("serpent-game-console-open", (!v).toString()); } catch { /* ignore */ }
      return !v;
    });
  };

  const list = habits || [];
  const game = useMemo(() => computeGame(list, goal.weeks || 26), [list, goal.weeks]);
  const nudges = useMemo(() => buildConsistencyNudges(list, game), [list, game]);

  const today = todayISO();
  const steps = useMemo(
    () => list.filter((h) => isHabitDue(h, today) && !isHabitCompleteOn(h, today)).slice(0, 4),
    [list, today]
  );

  const pct = Math.round(game.progress * 100);
  const remaining = Math.max(0, game.target - game.points);

  return (
    <section className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-cat-h/5 overflow-hidden">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Gamepad2 size={15} className="text-primary shrink-0" />
        <span className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Game console</span>
        <span className="ml-auto flex items-center gap-2 text-[11px] font-mono tabular-nums">
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
              Lv {game.level} {game.levelName} · ×{game.multiplier.toFixed(2)} · {remaining.toLocaleString()} pts to win
            </p>
          </div>

          {/* Priority steps to win */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground flex items-center gap-1">
              <Target size={10} /> Steps to win today
            </p>
            {steps.length === 0 ? (
              <p className="text-[11px] text-cat-a mt-1">All habits logged — perfect day secured.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {steps.map((h) => (
                  <li key={h.id} className="text-[11px] text-foreground flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                    <span className="truncate">{h.name}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              +{Math.max(0, game.todayPotential - game.todayPoints)} pts still on the table today
            </p>
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
