import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Activity, ArrowRight, Flame, Lightbulb, MapPin, Star, Target } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Task } from "@/lib/types";
import { Habit } from "@/lib/habits";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { overdueTasks } from "@/lib/scoring";
import { buildOrgTips } from "@/lib/orgTips";
import { computeGame } from "@/lib/consistencyGame";
import { computeSerpentHealth } from "@/lib/serpentHealth";
import {
  DashboardLocation,
  Weather,
  fetchWeather,
  loadLocation,
  onLocationChange,
} from "@/lib/dashboardSettings";

const LIFEPLAN_KEY = "serpent-lifeplan-v2";

interface LPTask { id: string; task: string; deadline?: string; done?: boolean }
interface LPGroup { id: string; name: string; tasks?: LPTask[]; archived?: boolean }

function loadLifePlanPriorities(): { group: string; task: string; deadline?: string }[] {
  try {
    const raw = localStorage.getItem(LIFEPLAN_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const groups: LPGroup[] = (data?.projects || []).filter((p: LPGroup) => !p.archived);
    const out: { group: string; task: string; deadline?: string }[] = [];
    for (const g of groups) {
      for (const t of g.tasks || []) {
        if (t.done) continue;
        out.push({ group: g.name, task: t.task, deadline: t.deadline });
      }
    }
    return out
      .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
      .slice(0, 3);
  } catch {
    return [];
  }
}

function rank(t: Task): number {
  const c = new Set((t.categories || []).map((x) => String(x).toUpperCase()));
  let s = 0;
  if (c.has("A1")) s += 1000;
  if (c.has("B1")) s += 700;
  if (c.has("K")) s += 600;
  if (c.has("A2")) s += 400;
  if (t.dueDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (t.dueDate < today) s += 900;
    else if (t.dueDate === today) s += 500;
  }
  return s;
}

function navigate(view: string) {
  window.dispatchEvent(new CustomEvent("serpent-navigate", { detail: view }));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function Cell({
  children,
  title,
  details,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  details?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const cls =
    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground whitespace-nowrap hover:border-primary/40 transition-colors";
  if (!details && !action) {
    return <div title={title} className={cls}>{children}</div>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title={title} className={cls}>{children}</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-xs space-y-2">
        {title && <div className="font-semibold text-sm">{title}</div>}
        <div className="text-muted-foreground space-y-1">{details}</div>
        {action && (
          <Button size="sm" className="w-full" onClick={action.onClick}>
            {action.label}
            <ArrowRight size={12} className="ml-1" />
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}


export default function StatusBar({ tasks, onOpenSettings }: { tasks: Task[]; onOpenSettings?: () => void }) {
  const [habits] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const [now, setNow] = useState(() => new Date());
  const [loc, setLoc] = useState<DashboardLocation>(() => loadLocation());
  const [weather, setWeather] = useState<Weather | null>(null);
  const [lifePlan, setLifePlan] = useState(loadLifePlanPriorities);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => onLocationChange(setLoc), []);

  useEffect(() => {
    let cancelled = false;
    fetchWeather(loc)
      .then((w) => { if (!cancelled) setWeather(w); })
      .catch(() => { if (!cancelled) setWeather(null); });
    const id = window.setInterval(() => {
      fetchWeather(loc).then((w) => { if (!cancelled) setWeather(w); }).catch(() => {});
    }, 15 * 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [loc.lat, loc.lon]);

  useEffect(() => {
    const refresh = () => setLifePlan(loadLifePlanPriorities());
    window.addEventListener("lifeplan-updated", refresh as EventListener);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("lifeplan-updated", refresh as EventListener);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const overdue = useMemo(() => overdueTasks(tasks || []).length, [tasks]);
  const tips = useMemo(() => buildOrgTips(tasks || [], habits || []), [tasks, habits]);
  const game = useMemo(() => computeGame(habits || []), [habits]);
  const health = useMemo(() => computeSerpentHealth(tasks || [], habits || []), [tasks, habits]);

  const topTip = tips.find((t) => t.severity === "warn") || tips[0];
  const topTask = useMemo(
    () => (tasks || []).filter((t) => !t.completed).sort((a, b) => rank(b) - rank(a))[0],
    [tasks]
  );

  const consistencyOnTrack = game.today.due === 0 || game.today.completed >= game.today.due;
  const consistencyPending = Math.max(0, game.today.due - game.today.completed);

  const healthColor =
    health.tone === "good" ? "text-emerald-600" : health.tone === "ok" ? "text-amber-600" : "text-destructive";

  const overdueList = useMemo(() => overdueTasks(tasks || []).slice(0, 5), [tasks]);
  const todayStr = new Date().toISOString().slice(0, 10);
  const dueToday = (tasks || []).filter((t) => !t.completed && t.dueDate === todayStr);

  return (
    <div className="w-full border-b border-border bg-secondary/40">
      <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-2 flex flex-wrap items-center gap-2 lg:flex-nowrap lg:overflow-x-auto lg:scrollbar-none">
        {/* Serpent phase — automatic */}
        <Cell
          title="Serpent phase"
          details={
            <>
              <div className="text-foreground font-medium">{phaseLabel(phase)}</div>
              <div>Set automatically from the clock and your flow progress.</div>
              <div>
                Start {flow.startCompleted ? "✓" : "—"} · Midday {flow.middayCompleted ? "✓" : "—"} · Evening{" "}
                {flow.eveningCompleted ? "✓" : "—"}
              </div>
              <div>The daily flow is mandatory; each step must be completed.</div>
            </>
          }
          action={{ label: "Open flow", onClick: () => window.dispatchEvent(new CustomEvent("serpent-open-flow")) }}
        >
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${phaseChip}`}>
            {phase === "planning" ? "Plan" : phase === "action" ? "Act" : "Review"}
          </span>
          <span className="text-muted-foreground">phase</span>
        </Cell>

        {/* Date + time */}

        <Cell
          title="Today"
          details={
            <>
              <div>{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
              <div>{dueToday.length} task{dueToday.length === 1 ? "" : "s"} due today</div>
              <div>{overdue} overdue</div>
            </>
          }
          action={{ label: "Open calendar", onClick: () => navigate("calendar") }}
        >
          <span className="font-semibold">
            {now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
          </span>
          <span className="text-muted-foreground">
            {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        </Cell>

        {/* Weather + location */}
        <Cell
          title="Weather"
          details={
            <>
              <div>
                {weather ? `${weather.emoji} ${weather.tempC}°C · ${weather.label}` : "Weather unavailable"}
              </div>
              <div>Location: {loc.name}</div>
            </>
          }
          action={{ label: "Change location", onClick: () => onOpenSettings?.() }}
        >
          <span>{weather?.emoji ?? "🌡️"}</span>
          <span className="font-semibold">{weather ? `${weather.tempC}°C` : "—"}</span>
          <span className="text-muted-foreground">{weather?.label ?? "weather"}</span>
          <MapPin size={11} className="text-muted-foreground" />
          <span className="text-muted-foreground">{loc.name}</span>
        </Cell>

        {/* Overdue */}
        <Cell
          title="Overdue tasks"
          details={
            overdueList.length === 0 ? (
              <div>Nothing overdue. Keep it that way.</div>
            ) : (
              <ul className="space-y-1">
                {overdueList.map((t) => (
                  <li key={t.id} className="truncate">
                    • {t.title}
                    {t.dueDate ? ` (${t.dueDate})` : ""}
                  </li>
                ))}
                {overdue > overdueList.length && <li>+{overdue - overdueList.length} more</li>}
              </ul>
            )
          }
          action={{ label: "Open tasks", onClick: () => navigate("tasks") }}
        >
          <AlertTriangle size={12} className={overdue > 0 ? "text-destructive" : "text-muted-foreground"} />
          <span className={overdue > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}>
            {overdue} overdue
          </span>
        </Cell>

        {/* Consistency */}
        <Cell
          title="Consistency for today"
          details={
            <>
              <div>{game.today.completed}/{game.today.due} habits logged today</div>
              <div>Streak: {game.streak} day{game.streak === 1 ? "" : "s"}</div>
              <div>Points: {game.points} · Level {game.level}</div>
            </>
          }
          action={{ label: "Open consistency", onClick: () => navigate("consistency") }}
        >
          <Flame size={12} className={consistencyOnTrack ? "text-emerald-600" : "text-amber-600"} />
          <span className={consistencyOnTrack ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
            {consistencyOnTrack ? "On track" : `${consistencyPending} habit${consistencyPending === 1 ? "" : "s"} left`}
          </span>
          <span className="text-muted-foreground">· streak {game.streak}d</span>
        </Cell>

        {/* Serpent health */}
        <Cell
          title="Serpent health"
          details={
            <>
              <div>Score: {health.score}/100 · {health.label}</div>
              <div>Completion: {Math.round(health.completion * 100)}%</div>
              <div>On time: {Math.round(health.onTime * 100)}%</div>
              <div>Consistency: {Math.round(health.consistency * 100)}%</div>
            </>
          }
          action={{ label: "Open tasks", onClick: () => navigate("tasks") }}
        >
          <Activity size={12} className={healthColor} />
          <span className="text-muted-foreground">Serpent health</span>
          <span className={`font-semibold ${healthColor}`}>{health.score}</span>
          <span className="text-muted-foreground">{health.label}</span>
        </Cell>

        {/* Most important task */}
        <Cell
          title="Most important task"
          details={
            topTask ? (
              <>
                <div className="text-foreground font-medium">{topTask.title}</div>
                {topTask.categories?.length ? <div>Categories: {topTask.categories.join(", ")}</div> : null}
                {topTask.dueDate ? <div>Due: {topTask.dueDate}</div> : null}
              </>
            ) : (
              <div>Nothing open.</div>
            )
          }
          action={{ label: "Open tasks", onClick: () => navigate("tasks") }}
        >
          <Star size={12} className="text-primary" />
          <span className="text-muted-foreground">A1</span>
          <span className="font-medium max-w-[220px] truncate">{topTask?.title || "Nothing open"}</span>
        </Cell>

        {/* Life plan priorities */}
        {lifePlan.length > 0 && (
          <Cell
            title="Life plan priorities"
            details={
              <ul className="space-y-1">
                {lifePlan.map((p, i) => (
                  <li key={i}>
                    • <span className="text-foreground">{p.group}</span>: {p.task}
                    {p.deadline ? ` (${p.deadline})` : ""}
                  </li>
                ))}
              </ul>
            }
            action={{ label: "Open life plan", onClick: () => navigate("lifeplan") }}
          >
            <Target size={12} className="text-primary" />
            <span className="text-muted-foreground">Life plan</span>
            <span className="font-medium max-w-[240px] truncate">
              {lifePlan[0].group}: {lifePlan[0].task}
            </span>
            {lifePlan.length > 1 && <span className="text-muted-foreground">+{lifePlan.length - 1}</span>}
          </Cell>
        )}

        {/* Top tip */}
        {topTip && (
          <Cell
            title={topTip.title}
            details={<div>{topTip.detail}</div>}
            action={{ label: "Open tasks", onClick: () => navigate("tasks") }}
          >
            <Lightbulb size={12} className={topTip.severity === "warn" ? "text-amber-600" : "text-primary"} />
            <span className="font-medium max-w-[260px] truncate">{topTip.title}</span>
          </Cell>
        )}
      </div>
    </div>

  );
}
