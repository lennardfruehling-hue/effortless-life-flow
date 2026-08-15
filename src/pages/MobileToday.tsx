import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Bell, BellRing, ListChecks, Target, Clock, AlertTriangle,
  CalendarRange, LayoutGrid, ArrowLeft, RefreshCw, Check, Share2,
} from "lucide-react";
import { Task, WeeklyStructureBlock } from "@/lib/types";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { loadCutoffs, FlowCutoffs } from "@/lib/flowSettings";
import { loadFlowState, saveFlowState, onFlowStateChange, SerpentFlowDayState } from "@/lib/serpentFlowState";

/* ---------------- Life plan (localStorage, hydrated from cloud) ---------------- */
const LIFEPLAN_KEY = "serpent-lifeplan-v2";

interface LPTask { id: string; task: string; deadline: string; done: boolean }
interface LPGroup { id: string; name: string; tasks: LPTask[]; endDate?: string; archived?: boolean }

function loadLifePlan(): LPGroup[] {
  try {
    const raw = localStorage.getItem(LIFEPLAN_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return (data?.projects || []).filter((p: LPGroup) => !p.archived);
  } catch {
    return [];
  }
}

/* ---------------- Serpent ranking (mirrors the desktop daily list) ---------------- */
function rankTask(t: Task): number {
  let s = 0;
  const c = new Set(t.categories);
  if (c.has("A1")) s += 1000;
  if (c.has("B1")) s += 700;
  if (c.has("K")) s += 600;
  if (c.has("A2")) s += 400;
  if (c.has("B2")) s += 350;
  if (c.has("C")) s += 120;
  if (c.has("D")) s += 80;
  if (c.has("H")) s += 60;
  if (c.has("G")) s += 30;
  if (c.has("J")) s += 20;
  if (c.has("E")) s -= 40;
  if (c.has("F")) s -= 80;
  if (c.has("I")) s -= 150;
  if (c.has("A3")) s -= 20;
  if (t.dueDate) {
    const days = Math.floor((new Date(t.dueDate).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) s += 500;
    else if (days <= 1) s += 250;
    else if (days <= 3) s += 120;
  }
  if (t.dueTime) s += 40;
  if (t.makesProud) s += 30 + Math.min(60, (t.duration ?? 0) / 2);
  return s;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowHHMM = () => new Date().toTimeString().slice(0, 5);

function endOfWeek(): Date {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() + (6 - day));
  d.setHours(23, 59, 59, 999);
  return d;
}

/* ---------------- Notifications ---------------- */
const NOTIF_FLAG_KEY = "serpent-mobile-notifs";

function useNotifications(enabled: boolean) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const request = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPermission(p);
    return p;
  };
  const notify = (title: string, body: string, tag: string) => {
    if (!enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, tag, icon: "/favicon.ico" });
    } catch { /* noop */ }
  };
  return { permission, request, notify };
}

/* ---------------- Page ---------------- */
export default function MobileToday() {
  const [tasks, setTasks] = useCloudState<Task[]>(CLOUD_KEYS.tasks, []);
  const [structure] = useCloudState<WeeklyStructureBlock[]>(CLOUD_KEYS.weeklyStructure, []);
  const [lifePlan, setLifePlan] = useState<LPGroup[]>(loadLifePlan);
  const [flow, setFlow] = useState<SerpentFlowDayState>(loadFlowState);
  const [cutoffs, setCutoffs] = useState<FlowCutoffs>(loadCutoffs);
  const [notifsOn, setNotifsOn] = useState(() => localStorage.getItem(NOTIF_FLAG_KEY) === "1");
  const [tick, setTick] = useState(0);
  const { permission, request, notify } = useNotifications(notifsOn);

  // Keep local mirrors fresh (cloud hydration fires storage/lifeplan events).
  useEffect(() => {
    const refresh = () => { setLifePlan(loadLifePlan()); setCutoffs(loadCutoffs()); };
    window.addEventListener("storage", refresh);
    window.addEventListener("lifeplan-updated", refresh as EventListener);
    const t = window.setInterval(() => { refresh(); setTick((n) => n + 1); }, 60_000);
    const off = onFlowStateChange(setFlow);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("lifeplan-updated", refresh as EventListener);
      window.clearInterval(t);
      off();
    };
  }, []);

  const iso = todayISO();
  const dow = new Date().getDay();

  /* 1. Daily Serpent list */
  const dailyRecurring = useMemo(
    () => tasks.filter((t) => t.recurrence === "daily" && t.lastCompletedPeriod !== iso),
    [tasks, iso]
  );
  const rankedToday = useMemo(
    () => tasks.filter((t) => !t.completed && !t.recurrence).sort((a, b) => rankTask(b) - rankTask(a)),
    [tasks]
  );

  /* 2. Life plan priorities */
  const lifePriorities = useMemo(() => {
    const out: { project: string; task: string; deadline: string; overdue: boolean }[] = [];
    for (const p of lifePlan) {
      for (const t of p.tasks || []) {
        if (t.done) continue;
        const overdue = !!t.deadline && new Date(t.deadline) < new Date(iso);
        out.push({ project: p.name, task: t.task, deadline: t.deadline || "", overdue });
      }
    }
    return out
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return (a.deadline || "9999").localeCompare(b.deadline || "9999");
      })
      .slice(0, 12);
  }, [lifePlan, iso]);

  /* 3. Serpent reminders */
  const now = nowHHMM();
  const checks = [
    { key: "start" as const, label: "Morning · Start Serpent", by: cutoffs.start, done: flow.startCompleted },
    { key: "midday" as const, label: "Lunch · Midday Check", by: cutoffs.midday, done: flow.middayCompleted },
    { key: "evening" as const, label: "Evening · Review", by: cutoffs.evening, done: flow.eveningCompleted },
  ];

  const toggleCheck = (key: "start" | "midday" | "evening") => {
    const field = key === "start" ? "startCompleted" : key === "midday" ? "middayCompleted" : "eveningCompleted";
    const next = { ...flow, [field]: !flow[field] } as SerpentFlowDayState;
    setFlow(next);
    saveFlowState(next);
  };

  /* 4. Overdue */
  const overdue = useMemo(() => {
    const res: { task: Task; why: string }[] = [];
    for (const t of tasks) {
      if (t.completed) continue;
      if (t.dueDate && t.dueDate < iso) res.push({ task: t, why: `Due ${t.dueDate}` });
      else if (t.dueDate === iso && t.dueTime && t.dueTime < now) res.push({ task: t, why: `Was due ${t.dueTime}` });
      else if (!t.dueDate && t.dueTime && t.dueTime < now && t.recurrence === "daily" && t.lastCompletedPeriod !== iso)
        res.push({ task: t, why: `Daily · ${t.dueTime}` });
    }
    return res;
  }, [tasks, iso, now, tick]);

  /* 5. Weekly deadlines */
  const weekly = useMemo(() => {
    const eow = endOfWeek();
    return tasks.filter((t) => {
      if (t.completed) return false;
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        return d >= new Date(iso) && d <= eow;
      }
      return t.categories.includes("A2");
    });
  }, [tasks, iso]);

  /* 6. Daily structure */
  const structureToday = useMemo(
    () =>
      structure
        .filter((b) => (b.pinnedDate ? b.pinnedDate === iso : b.dayOfWeek === dow && b.recurring !== false))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [structure, iso, dow]
  );

  const titleFor = (b: WeeklyStructureBlock) =>
    b.label || tasks.find((t) => t.id === b.taskId)?.title || "Block";

  /* Notification engine */
  useEffect(() => {
    if (!notifsOn || permission !== "granted") return;
    const fired = new Set<string>(JSON.parse(sessionStorage.getItem("serpent-fired") || "[]"));
    const fire = (id: string, title: string, body: string) => {
      if (fired.has(id)) return;
      fired.add(id);
      sessionStorage.setItem("serpent-fired", JSON.stringify([...fired]));
      notify(title, body, id);
    };
    const check = () => {
      const t = nowHHMM();
      checks.forEach((c) => {
        if (!c.done && t >= c.by) fire(`${iso}-${c.key}`, "🐍 Serpent reminder", `${c.label} is overdue (by ${c.by})`);
      });
      overdue.forEach((o) => fire(`${iso}-od-${o.task.id}`, "⚠️ Overdue task", `${o.task.title} — ${o.why}`));
      structureToday.forEach((b) => {
        if (t === b.startTime) fire(`${iso}-st-${b.id}`, "🗓️ Structure", `${b.startTime} · ${titleFor(b)}`);
      });
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifsOn, permission, tick, overdue.length, structureToday.length, flow]);

  const toggleNotifs = async () => {
    if (!notifsOn) {
      const p = permission === "granted" ? "granted" : await request();
      if (p !== "granted") return;
      localStorage.setItem(NOTIF_FLAG_KEY, "1");
      setNotifsOn(true);
      notify("🐍 Serpent", "Daily reminders are on.", "serpent-on");
    } else {
      localStorage.setItem(NOTIF_FLAG_KEY, "0");
      setNotifsOn(false);
    }
  };

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.recurrence === "daily") {
          return { ...t, lastCompletedPeriod: t.lastCompletedPeriod === iso ? undefined : iso };
        }
        return { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined };
      })
    );
  };

  const share = async () => {
    const text =
      `🐍 Serpent · ${format(new Date(), "EEE d MMM")}\n\n` +
      `TODAY\n${[...dailyRecurring, ...rankedToday].slice(0, 20).map((t, i) => `${i + 1}. ${t.title}`).join("\n")}\n\n` +
      `OVERDUE\n${overdue.map((o) => `- ${o.task.title} (${o.why})`).join("\n") || "- none"}\n\n` +
      `STRUCTURE\n${structureToday.map((b) => `${b.startTime}–${b.endTime} ${titleFor(b)}`).join("\n") || "- none"}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Serpent today", text }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Link to="/" className="p-1 text-muted-foreground hover:text-foreground" aria-label="Back to app">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-sm font-semibold tracking-wide">🐍 Serpent · Today</h1>
          <span className="text-[10px] text-muted-foreground ml-auto">{format(new Date(), "EEE d MMM")}</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={toggleNotifs}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] border transition-colors ${
              notifsOn ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
            }`}
          >
            {notifsOn ? <BellRing size={12} /> : <Bell size={12} />}
            {notifsOn ? "Reminders on" : "Enable reminders"}
          </button>
          <button onClick={share} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] border border-border text-muted-foreground">
            <Share2 size={12} /> Share
          </button>
          <button onClick={() => setTick((n) => n + 1)} className="ml-auto p-1 text-muted-foreground" aria-label="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
      </header>

      <main className="px-3 py-3 space-y-4 max-w-xl mx-auto">
        {/* 3. Serpent reminders */}
        <Section icon={<Clock size={13} />} title="Serpent Checks">
          <div className="grid gap-1.5">
            {checks.map((c) => {
              const late = !c.done && now >= c.by;
              return (
                <button
                  key={c.key}
                  onClick={() => toggleCheck(c.key)}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs ${
                    c.done
                      ? "border-primary/40 bg-primary/10"
                      : late
                      ? "border-destructive/50 bg-destructive/10"
                      : "border-border bg-card/40"
                  }`}
                >
                  <span className={`h-4 w-4 rounded-sm border flex items-center justify-center ${c.done ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                    {c.done && <Check size={11} className="text-primary-foreground" />}
                  </span>
                  <span className={c.done ? "line-through opacity-60" : ""}>{c.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">by {c.by}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* 1. Daily Serpent list */}
        <Section icon={<ListChecks size={13} />} title={`Daily Serpent List · ${dailyRecurring.length + rankedToday.length}`}>
          <ul className="divide-y divide-border/60">
            {[...dailyRecurring, ...rankedToday].map((t, i) => {
              const done = t.recurrence === "daily" ? t.lastCompletedPeriod === iso : t.completed;
              return (
                <li key={t.id} className="flex items-start gap-2 py-1.5">
                  <button
                    onClick={() => toggleTask(t.id)}
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center ${done ? "bg-primary border-primary" : "border-muted-foreground/40"}`}
                    aria-label="Toggle task"
                  >
                    {done && <Check size={11} className="text-primary-foreground" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs leading-snug ${done ? "line-through opacity-50" : ""}`}>
                      <span className="text-muted-foreground mr-1">{i + 1}.</span>
                      {t.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex gap-1.5 flex-wrap">
                      {t.recurrence === "daily" && <span className="text-primary">↻ daily</span>}
                      {t.dueTime && <span>{t.dueTime}</span>}
                      {t.categories.length > 0 && <span>{t.categories.join(" · ")}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
            {dailyRecurring.length + rankedToday.length === 0 && <Empty>Nothing queued for today.</Empty>}
          </ul>
        </Section>

        {/* 4. Overdue */}
        <Section icon={<AlertTriangle size={13} />} title={`Overdue · ${overdue.length}`} tone="danger">
          <ul className="space-y-1">
            {overdue.map((o) => (
              <li key={o.task.id} className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => toggleTask(o.task.id)}
                  className="h-4 w-4 shrink-0 rounded-sm border border-destructive/50"
                  aria-label="Complete overdue task"
                />
                <span className="min-w-0 flex-1 truncate">{o.task.title}</span>
                <span className="text-[10px] text-destructive shrink-0">{o.why}</span>
              </li>
            ))}
            {overdue.length === 0 && <Empty>Nothing overdue. 🐍</Empty>}
          </ul>
        </Section>

        {/* 5. Weekly deadlines */}
        <Section icon={<CalendarRange size={13} />} title={`This Week · ${weekly.length}`}>
          <ul className="space-y-1">
            {weekly.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{t.dueDate || "A2"}</span>
              </li>
            ))}
            {weekly.length === 0 && <Empty>No deadlines this week.</Empty>}
          </ul>
        </Section>

        {/* 6. Daily structure */}
        <Section icon={<LayoutGrid size={13} />} title={`Today's Structure · ${structureToday.length}`}>
          <ul className="space-y-1">
            {structureToday.map((b) => {
              const active = now >= b.startTime && now <= b.endTime;
              return (
                <li
                  key={b.id}
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs ${active ? "bg-primary/10 border border-primary/40" : "bg-card/40 border border-border"}`}
                >
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0 w-[76px]">
                    {b.startTime}–{b.endTime}
                  </span>
                  <span className="min-w-0 flex-1">{titleFor(b)}</span>
                </li>
              );
            })}
            {structureToday.length === 0 && <Empty>No structure blocks for today.</Empty>}
          </ul>
        </Section>

        {/* 2. Life plan priorities */}
        <Section icon={<Target size={13} />} title="Life Plan Priorities">
          <ul className="space-y-1">
            {lifePriorities.map((p, i) => (
              <li key={i} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{p.task}</span>
                  {p.deadline && (
                    <span className={`text-[10px] shrink-0 ${p.overdue ? "text-destructive" : "text-muted-foreground"}`}>
                      {p.deadline}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{p.project}</div>
              </li>
            ))}
            {lifePriorities.length === 0 && <Empty>No open life plan items.</Empty>}
          </ul>
        </Section>
      </main>
    </div>
  );
}

function Section({ icon, title, children, tone }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: "danger" }) {
  return (
    <section className={`rounded-lg border p-2.5 ${tone === "danger" ? "border-destructive/30 bg-destructive/5" : "border-border bg-card/30"}`}>
      <h2 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="text-[11px] text-muted-foreground list-none py-1">{children}</li>;
}
