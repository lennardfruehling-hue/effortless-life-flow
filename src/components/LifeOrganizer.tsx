import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Task, Project, Reminder, LifePlanProject } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildVoiceState, runVoiceActions, VoiceAction } from "@/lib/voiceActions";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { Habit } from "@/lib/habits";
import { computeGame } from "@/lib/consistencyGame";
import { computeSerpentHealth } from "@/lib/serpentHealth";
import { buildOrgTips } from "@/lib/orgTips";
import { dailyScore, weeklyScore, overdueTasks, upcomingDeadlines } from "@/lib/scoring";

interface Props {
  tasks: Task[];
  projects: Project[];
  onSaveTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onSaveProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  reminders?: Reminder[];
  lifePlanProjects?: LifePlanProject[];
}

interface PlanStep {
  title: string;
  why?: string;
  steps?: string[];
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  plan?: PlanStep[];
  applied?: string[];
}

const QUICK_PROMPTS = [
  "Organize my day",
  "Sort out my week",
  "I'm behind — clear my overdue list",
  "Move my life plan forward this week",
  "Fix my consistency habits",
  "Where am I losing time?",
];

export default function LifeOrganizer({
  tasks,
  projects,
  onSaveTasks,
  onSaveProjects,
  reminders = [],
  lifePlanProjects = [],
}: Props) {
  const { user } = useAuth();
  const [habits] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [turns, busy]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const game = useMemo(() => computeGame(habits || []), [habits]);
  const health = useMemo(() => computeSerpentHealth(tasks, habits || []), [tasks, habits]);

  const send = useCallback(async (prompt: string) => {
    const clean = prompt.trim();
    if (!clean || busyRef.current) return;
    setError(null);
    setBusy(true);
    setTurns((prev) => [...prev, { role: "user", text: clean }]);

    try {
      const ctx = {
        userId: user?.id,
        tasks,
        projects,
        setTasks: onSaveTasks,
        setProjects: onSaveProjects,
      };
      const base = await buildVoiceState(ctx);
      const day = dailyScore(tasks);
      const week = weeklyScore(tasks);
      const state = {
        ...base,
        lifePlanProjects: lifePlanProjects.map((p) => ({ id: p.id, name: p.name })),
        reminders: reminders.slice(0, 40).map((r) => ({ id: r.id, title: r.title, datetime: r.datetime })),
        overdue: overdueTasks(tasks).slice(0, 40).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, categories: t.categories })),
        upcoming: upcomingDeadlines(tasks, 7).slice(0, 40).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, categories: t.categories })),
        score: { day, week },
        consistency: {
          points: game.points,
          level: game.level,
          streak: game.streak,
          progressToReward: game.progress,
          todayDue: game.today.due,
          todayCompleted: game.today.completed,
        },
        serpentHealth: { score: health.score, label: health.label },
        currentTips: buildOrgTips(tasks, habits || []).slice(0, 6).map((t) => `${t.title}: ${t.detail}`),
      };

      const history = turns.slice(-8).map((t) => ({ role: t.role, content: t.text }));
      const { data, error: fnErr } = await supabase.functions.invoke("serpent-voice", {
        body: {
          mode: "organizer",
          messages: [...history, { role: "user", content: clean }],
          state: JSON.stringify(state),
        },
      });
      if (fnErr) throw fnErr;

      const actions: VoiceAction[] = Array.isArray(data?.actions) ? data.actions : [];
      const applied = actions.length ? await runVoiceActions(actions, ctx) : [];
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data?.speak || "Here's how I'd organize this.",
          plan: Array.isArray(data?.plan) ? data.plan : [],
          applied,
        },
      ]);
    } catch (e: any) {
      console.error("[life-organizer] failed", e);
      setError(e?.message ?? "Couldn't reach the organizer.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, projects, onSaveTasks, onSaveProjects, user?.id, turns, reminders, lifePlanProjects, habits, game, health]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wand2 size={15} className="text-primary" /> Life organizer
        </span>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-[11px] text-muted-foreground">
            Health {health.score} · {game.points.toLocaleString()} pts · streak {game.streak}
          </span>
          <button onClick={() => setTurns([])} title="Clear" className="p-1 text-muted-foreground hover:text-destructive">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3 text-sm">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ask broadly or precisely. The organizer reads everything — tasks, categories, life plan, calendar, habits,
              score and health — and rebuilds your day, week or plan around it.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : "space-y-2"}>
            <div
              className={
                t.role === "user"
                  ? "inline-block rounded-lg bg-primary text-primary-foreground px-3 py-1.5 max-w-[85%] text-left"
                  : "text-foreground whitespace-pre-wrap"
              }
            >
              {t.text}
            </div>

            {t.plan && t.plan.length > 0 && (
              <ol className="space-y-2">
                {t.plan.map((s, j) => (
                  <li key={j} className="rounded-lg border border-border bg-background px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {j + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{s.title}</p>
                        {s.why && <p className="text-xs text-muted-foreground mt-0.5">{s.why}</p>}
                        {s.steps && s.steps.length > 0 && (
                          <ul className="mt-1 space-y-0.5 list-disc pl-4">
                            {s.steps.map((x, k) => (
                              <li key={k} className="text-xs text-muted-foreground">{x}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {t.applied && t.applied.length > 0 && (
              <ul className="space-y-0.5">
                {t.applied.map((a, j) => (
                  <li key={j} className="text-[11px] font-mono text-emerald-600">✓ {a}</li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Reading your whole system…
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); const v = text; setText(""); send(v); }}
        className="border-t border-border p-3 flex items-center gap-2"
      >
        <Sparkles size={15} className="text-primary flex-shrink-0" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. rebuild my week around the baby routine and the apartment hunt"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <button type="submit" disabled={busy || !text.trim()} className="p-2 text-primary disabled:opacity-40">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
