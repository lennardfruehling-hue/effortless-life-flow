import { useMemo } from "react";
import { Task } from "@/lib/types";
import { computeConsistency, ionianProgress, IONIAN_GOAL } from "@/lib/pride";
import { Flame, Trophy, Sparkles, Compass } from "lucide-react";

interface Props {
  tasks: Task[];
}

export default function ConsistencyView({ tasks }: Props) {
  const stats = useMemo(() => computeConsistency(tasks), [tasks]);
  const progress = ionianProgress(stats);
  const prideTotal = totalPride(tasks);
  const prideWeek = prideThisWeek(tasks);
  const dailyTasks = tasks.filter((t) => t.recurrence === "daily");
  const weeklyTasks = tasks.filter((t) => t.recurrence === "weekly");

  // Build a 14-week heatmap (90 days, 7 cols)
  const weeks: { date: string; ratio: number }[][] = [];
  let week: { date: string; ratio: number }[] = [];
  stats.daily.forEach((d, i) => {
    const ratio = d.total === 0 ? 0 : d.done / d.total;
    week.push({ date: d.date, ratio });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  });
  if (week.length) weeks.push(week);

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto scrollbar-thin">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Compass className="text-primary" size={22} /> Consistency
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Daily &amp; weekly habits compounding toward your goal.</p>
      </header>

      {/* Goal hero — Ionian map */}
      <div className="relative rounded-xl overflow-hidden border border-border bg-gradient-to-br from-primary/10 via-card to-cat-h/5 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Goal · 1 year</p>
            <h3 className="text-xl font-semibold text-foreground mt-1">{IONIAN_GOAL.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">Every consistent day brings the boat closer.</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary font-mono">{Math.round(progress * 100)}%</div>
            <div className="text-[11px] text-muted-foreground">to launch day</div>
          </div>
        </div>

        {/* Sailing route SVG */}
        <div className="mt-6">
          <svg viewBox="0 0 600 120" className="w-full h-auto">
            <defs>
              <linearGradient id="sea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="hsl(var(--primary) / 0.15)" />
                <stop offset="1" stopColor="hsl(var(--primary) / 0.02)" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="600" height="120" fill="url(#sea)" rx="8" />
            {/* islands */}
            {[80, 200, 320, 440, 560].map((x, i) => (
              <g key={i}>
                <ellipse cx={x} cy={70} rx="22" ry="8" fill="hsl(var(--muted))" opacity="0.4" />
                <circle cx={x} cy={64} r="10" fill="hsl(var(--cat-h))" opacity="0.4" />
              </g>
            ))}
            {/* dotted route */}
            <path d="M 20 60 Q 140 30 260 60 T 500 60 L 580 60" stroke="hsl(var(--primary) / 0.4)" strokeWidth="2" strokeDasharray="4 4" fill="none" />
            {/* progress route */}
            <path d="M 20 60 Q 140 30 260 60 T 500 60 L 580 60" stroke="hsl(var(--primary))" strokeWidth="3" fill="none"
              strokeDasharray={`${560 * progress} 9999`} />
            {/* boat */}
            <g transform={`translate(${20 + 560 * progress}, 60)`}>
              <text x="0" y="6" fontSize="22" textAnchor="middle">⛵</text>
            </g>
          </svg>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile icon={<Flame size={16} className="text-cat-f" />} label="Current streak" value={`${stats.currentStreak}d`} />
        <Tile icon={<Trophy size={16} className="text-cat-h" />} label="Best streak" value={`${stats.bestStreak}d`} />
        <Tile icon={<Sparkles size={16} className="text-cat-h" />} label="Pride · all-time" value={String(prideTotal)} />
        <Tile icon={<Sparkles size={16} className="text-primary" />} label="Pride · this week" value={`+${prideWeek}`} />
      </div>

      {/* Heatmap */}
      <section className="rounded-lg border border-border bg-card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-foreground">90-day heatmap</h3>
          <p className="text-[11px] text-muted-foreground">{dailyTasks.length} daily · {weeklyTasks.length} weekly</p>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin">
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {w.map((d, di) => {
                const bg =
                  d.ratio === 0 ? "bg-muted/40" :
                  d.ratio < 0.5 ? "bg-primary/30" :
                  d.ratio < 1 ? "bg-primary/60" :
                  "bg-primary";
                return (
                  <div key={di} title={`${d.date} — ${Math.round(d.ratio * 100)}%`}
                    className={`w-3 h-3 rounded-sm ${bg}`} />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-muted/40" />
          <div className="w-3 h-3 rounded-sm bg-primary/30" />
          <div className="w-3 h-3 rounded-sm bg-primary/60" />
          <div className="w-3 h-3 rounded-sm bg-primary" />
          <span>More</span>
        </div>
      </section>

      {/* Today checklist */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Today's habits</h3>
        {dailyTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No daily tasks yet. Add one in the Tasks view and set Recurrence to Daily.</p>
        ) : (
          <ul className="space-y-1.5">
            {dailyTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${t.completed ? "bg-primary" : "bg-muted-foreground/30"}`} />
                <span className={t.completed ? "line-through text-muted-foreground" : "text-foreground"}>{t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold text-foreground mt-1 font-mono">{value}</div>
    </div>
  );
}
