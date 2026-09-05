import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, HelpCircle, Loader2, Send, Sparkles, Trash2, Wand2, X } from "lucide-react";
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

interface Conflict {
  issue: string;
  detail?: string;
  fix?: string;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  plan?: PlanStep[];
  /** Follow-up questions that narrow a broad request into specifics. */
  questions?: string[];
  /** Clashes and inconsistencies the organizer found in the plan. */
  conflicts?: Conflict[];
  /** Changes the organizer wants to make — nothing happens until the user approves. */
  proposed?: VoiceAction[];
  /** "pending" until the user decides. */
  status?: "pending" | "approved" | "declined";
  applied?: string[];
}

/** Plain-language description of a proposed change, so the user knows what they approve. */
function describeAction(a: VoiceAction): string {
  const label = a.title || a.name || a.match?.title || a.match?.name || a.id || "";
  const t = String(a.type || "").toLowerCase();
  const pretty = t.replace(/[_.]/g, " ");
  if (t.includes("delete") || t.includes("remove")) return `Delete ${label || "an item"}`;
  if (t.includes("create") || t.includes("add")) return `Create ${label ? `"${label}"` : "a new item"}`;
  if (t.includes("update") || t.includes("edit") || t.includes("complete") || t.includes("schedule") || t.includes("move"))
    return `${pretty.charAt(0).toUpperCase()}${pretty.slice(1)}${label ? `: ${label}` : ""}`;
  if (t.includes("navigate") || t.includes("open")) return `Open ${a.view || a.tab || label || "a section"}`;
  return `${pretty.charAt(0).toUpperCase()}${pretty.slice(1)}${label ? `: ${label}` : ""}`;
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
      if (data?.error) throw new Error(String(data.error));

      // Nothing is changed automatically: every action waits for the user's approval.
      const actions: VoiceAction[] = Array.isArray(data?.actions) ? data.actions : [];
      const plan = Array.isArray(data?.plan) ? data.plan : [];
      const text =
        (typeof data?.speak === "string" && data.speak.trim()) ||
        (plan.length ? "Here's how I'd organize this." : "I didn't get a reply that time — try asking again.");
      const questions: string[] = Array.isArray(data?.questions)
        ? data.questions.filter((q: unknown) => typeof q === "string" && q.trim()).slice(0, 5)
        : [];
      const conflicts: Conflict[] = Array.isArray(data?.conflicts)
        ? data.conflicts.filter((c: any) => c && typeof c.issue === "string").slice(0, 6)
        : [];
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text,
          plan,
          questions,
          conflicts,
          proposed: actions,
          status: actions.length ? "pending" : undefined,
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

  const approve = useCallback(async (index: number) => {
    const turn = turns[index];
    if (!turn?.proposed?.length) return;
    const ctx = {
      userId: user?.id,
      tasks,
      projects,
      setTasks: onSaveTasks,
      setProjects: onSaveProjects,
    };
    let applied: string[] = [];
    try {
      applied = await runVoiceActions(turn.proposed, ctx);
    } catch (e) {
      console.error("[life-organizer] action failed", e);
      applied = ["Some changes couldn't be applied."];
    }
    setTurns((prev) =>
      prev.map((t, i) => (i === index ? { ...t, status: "approved" as const, applied, proposed: [] } : t))
    );
  }, [turns, tasks, projects, onSaveTasks, onSaveProjects, user?.id]);

  const decline = useCallback((index: number) => {
    setTurns((prev) =>
      prev.map((t, i) => (i === index ? { ...t, status: "declined" as const, proposed: [] } : t))
    );
  }, []);

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

            {t.conflicts && t.conflicts.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                  <AlertTriangle size={12} /> Clashes to resolve
                </p>
                {t.conflicts.map((c, j) => (
                  <div key={j} className="text-xs">
                    <span className="font-medium text-foreground">{c.issue}</span>
                    {c.detail && <span className="text-muted-foreground"> — {c.detail}</span>}
                    {c.fix && <div className="text-[11px] text-primary">Fix: {c.fix}</div>}
                  </div>
                ))}
              </div>
            )}

            {t.questions && t.questions.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <HelpCircle size={12} /> Answer to get specific
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {t.questions.map((q, j) => (
                    <button
                      key={j}
                      onClick={() => send(q)}
                      className="rounded-full border border-border px-3 py-1 text-xs text-left text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {t.status === "pending" && t.proposed && t.proposed.length > 0 && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Asking permission — {t.proposed.length} change{t.proposed.length > 1 ? "s" : ""}
                </p>
                <ul className="space-y-0.5">
                  {t.proposed.map((a, j) => (
                    <li key={j} className="text-xs text-foreground">• {describeAction(a)}</li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-0.5">
                  <button
                    onClick={() => approve(i)}
                    className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Check size={13} /> Allow
                  </button>
                  <button
                    onClick={() => decline(i)}
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X size={13} /> Don't change anything
                  </button>
                </div>
              </div>
            )}

            {t.status === "declined" && (
              <p className="text-[11px] text-muted-foreground">Nothing was changed.</p>
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
          placeholder="e.g. rebuild my week around work and the apartment hunt"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <button type="submit" disabled={busy || !text.trim()} className="p-2 text-primary disabled:opacity-40">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
