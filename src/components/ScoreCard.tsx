import { useMemo, useState } from "react";
import { Task } from "@/lib/types";
import {
  dailyScore,
  weeklyScore,
  rewardProgress,
  resetRewardProgress,
  upcomingDeadlines,
  overdueTasks,
  REWARD,
} from "@/lib/scoring";
import { Trophy, AlertTriangle, CalendarClock, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  tasks: Task[];
}

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export default function ScoreCard({ tasks }: Props) {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);

  const day = useMemo(() => dailyScore(tasks), [tasks]);
  const week = useMemo(() => weeklyScore(tasks), [tasks]);
  const reward = useMemo(() => rewardProgress(week), [week]);
  const soon = useMemo(() => upcomingDeadlines(tasks, 3), [tasks]);
  const late = useMemo(() => overdueTasks(tasks), [tasks]);

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-foreground">Today</span>
            <span className="font-mono text-muted-foreground">
              {day.net} / {day.target}
            </span>
          </div>
          <Bar value={day.progress} tone={day.progress >= 1 ? "bg-emerald-500" : "bg-primary"} />
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-foreground">This week</span>
            <span className="font-mono text-muted-foreground">
              {week.net} / {week.target}
            </span>
          </div>
          <Bar value={week.progress} tone={week.progress >= 1 ? "bg-emerald-500" : "bg-primary"} />
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Details
        </button>
      </div>

      {(week.penalty > 0 || soon.length > 0) && (
        <div className="flex flex-wrap gap-2 mt-2">
          {week.penalty > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-destructive/10 text-destructive border border-destructive/30">
              <AlertTriangle size={12} /> −{week.penalty} pts · {week.failed} broken commitment{week.failed > 1 ? "s" : ""}
            </span>
          )}
          {soon.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/30">
              <CalendarClock size={12} /> {soon.length} date{soon.length > 1 ? "s" : ""} due within 3 days
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3 text-xs">
          <div className="rounded-lg border border-border p-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Trophy size={13} className="text-cat-h" /> {REWARD.title}
              </span>
              <span className="font-mono text-muted-foreground">
                {reward.weeksMet}/{REWARD.weeks} weeks
              </span>
            </div>
            <Bar value={reward.progress} tone="bg-cat-h" />
            <p className="text-muted-foreground mt-1.5">
              Only weeks where the full target is met count. Current streak: {reward.streak}. The target is 95% of
              everything you put on the list — it is only reachable if you finish what you commit to.
            </p>
            <button
              onClick={() => {
                resetRewardProgress();
                force((n) => n + 1);
              }}
              className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted text-muted-foreground"
            >
              <RotateCcw size={12} /> Reset reward target
            </button>
          </div>

          {late.length > 0 && (
            <div>
              <p className="font-medium text-destructive mb-1">Broken commitments ({late.length})</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {late.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    · {t.title} <span className="opacity-60">— was due {t.dueDate}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {soon.length > 0 && (
            <div>
              <p className="font-medium text-foreground mb-1">Coming up</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {soon.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    · {t.title} <span className="opacity-60">— {t.dueDate}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
