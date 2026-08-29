import { useEffect, useLayoutEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, ChevronUp, Bell, AlertTriangle, Clock, Compass, UserPlus, FileText, ListTodo } from "lucide-react";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";
import {
  loadFlowState,
  saveFlowState,
  SerpentFlowDayState,
  SerpentPhase,
  autoPhase,
  mandatoryFlow,
} from "@/lib/serpentFlowState";

import { Task, Reminder, LifePlanProject, DailyScheduleSlot } from "@/lib/types";
import { loadCutoffs, onCutoffsChange, FlowCutoffs } from "@/lib/flowSettings";
import risingSun from "@/assets/serpent-rising-sun.png";
import sun from "@/assets/serpent-sun.png";
import halfMoon from "@/assets/serpent-half-moon.png";

type FlowKind = "start" | "midday" | "evening";

/** What the user must do before the Next button unlocks for a step. */
type Requirement =
  | { kind: "click-target" }                // any click inside / on the highlighted target
  | { kind: "progress-event"; event: string } // CustomEvent name on window: serpent-progress with detail===event
  | { kind: "none" };

interface Step {
  title: string;
  body: string;
  target?: string;
  requires?: Requirement;
  hint?: string; // shown while gated
}

const FLOWS: Record<FlowKind, { label: string; steps: Step[] }> = {
  start: {
    label: "Start Serpent 🐍",
    steps: [
      { title: "Review yesterday's tasks", body: "Open Tasks and scan what carried over from yesterday.", target: '[data-tour="nav-tasks"]', requires: { kind: "click-target" }, hint: "Click the Tasks nav item to open the list." },
      { title: "Add today's tasks", body: "Drop in anything new for today.", target: '[data-tour="add-task"]', requires: { kind: "click-target" }, hint: "Click Add Task to add new items." },
      { title: "Anything you don't want to know?", body: "Mark tasks to hide / defer (Avoid / Hate categories). Tick when reviewed.", requires: { kind: "none" } },
      { title: "Check non-negotiables (K)", body: "Confirm K-category items are in today's list.", requires: { kind: "none" } },
      { title: "Build today's schedule", body: "Open Schedule and drag tasks into time blocks.", target: '[data-tour="schedule-toggle"]', requires: { kind: "progress-event", event: "schedule-block-added" }, hint: "Open Schedule and add at least one block." },
      { title: "Realistic timing — add buffers", body: "Sanity-check durations; add extra time for each task.", requires: { kind: "none" } },
      { title: "Print schedule", body: "Open a printable copy.", target: '[data-tour="print-schedule"]', requires: { kind: "progress-event", event: "schedule-printed" }, hint: "Click Print schedule." },
      { title: "Email schedule", body: "Send today's schedule to your inbox.", target: '[data-tour="email-schedule"]', requires: { kind: "progress-event", event: "schedule-emailed" }, hint: "Click Email schedule." },
    ],
  },
  midday: {
    label: "Midday Check 🐍",
    steps: [
      { title: "Daily Serpent list · A1", body: "Check progress on A1 daily items.", target: '[data-tour="nav-consistency"]', requires: { kind: "click-target" }, hint: "Open the Consistency view to continue." },
    ],
  },
  evening: {
    label: "Evening Review 🐍",
    steps: [
      { title: "Daily Serpent list · A1", body: "Review and check non-negotiable (K) items.", target: '[data-tour="nav-consistency"]', requires: { kind: "click-target" }, hint: "Open the Consistency view to continue." },
    ],
  },
};

interface Rect { top: number; left: number; width: number; height: number; }

function useTargetRect(selector: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!selector) { setRect(null); return; }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      if (r.top < 0 || r.bottom > window.innerHeight) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    measure();
    const onChange = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    const interval = window.setInterval(measure, 500);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, [selector]);
  return rect;
}

function derivePhase(s: SerpentFlowDayState, active: FlowKind | null, _manual: SerpentPhase | null): SerpentPhase {
  // Phase is automatic: an open flow wins, otherwise the clock decides.
  if (active === "start") return "planning";
  if (active === "midday") return "action";
  if (active === "evening") return "review";
  return autoPhase(s);
}


interface SerpentFlowProps {
  tasks?: Task[];
  reminders?: Reminder[];
  lifePlanProjects?: LifePlanProject[];
  dailySchedule?: DailyScheduleSlot[];
  /** Render the command center inline (inside the assistant bar) instead of as a floating dock. */
  embedded?: boolean;
}

export default function SerpentFlow({ tasks = [], reminders = [], lifePlanProjects = [], dailySchedule = [], embedded = false }: SerpentFlowProps = {}) {

  const [state, setState] = useState<SerpentFlowDayState>(loadFlowState);
  const [active, setActive] = useState<FlowKind | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [trioOpen, setTrioOpen] = useState(false);
  const [manualPhase, setManualPhase] = useState<SerpentPhase | null>(null);
  // Tracks whether the active step's requirement is satisfied.
  const [stepSatisfied, setStepSatisfied] = useState(false);

  // Phase is derived automatically and re-evaluated every minute.
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Persist + broadcast phase whenever inputs change.
  useEffect(() => {
    const next = { ...state, phase: derivePhase(state, active, manualPhase) };
    if (next.phase !== state.phase) setState(next);
    saveFlowState(next);
  }, [state, active, manualPhase, clockTick]);

  // Which flow the user is required to complete right now.
  const required = useMemo(() => {
    void clockTick;
    return mandatoryFlow(state);
  }, [state, clockTick]);

  const startFlow = (kind: FlowKind) => {
    setTrioOpen(false);
    setActive(kind);
    setStepIdx(0);
  };

  const next = () => {
    if (!active) return;
    const flow = FLOWS[active];
    if (stepIdx + 1 >= flow.steps.length) {
      setState((s) => ({
        ...s,
        startCompleted: active === "start" ? true : s.startCompleted,
        middayCompleted: active === "midday" ? true : s.middayCompleted,
        eveningCompleted: active === "evening" ? true : s.eveningCompleted,
      }));
      setActive(null);
      setStepIdx(0);
    } else {
      setStepIdx(stepIdx + 1);
    }
  };

  // Mandatory: the required flow opens itself and stays open until completed.
  useEffect(() => {
    if (active || !required) return;
    setTrioOpen(false);
    setActive(required);
    setStepIdx(0);
  }, [required, active]);


  const currentStep = active ? FLOWS[active].steps[stepIdx] : undefined;
  const targetRect = useTargetRect(currentStep?.target);

  // Reset gating when step changes; auto-satisfy if requirement is "none".
  useEffect(() => {
    if (!currentStep) { setStepSatisfied(false); return; }
    const req = currentStep.requires ?? { kind: "none" as const };
    setStepSatisfied(req.kind === "none");
  }, [active, stepIdx, currentStep]);

  // Listen for the step requirement: target click or progress event.
  useEffect(() => {
    if (!active || !currentStep) return;
    const req = currentStep.requires ?? { kind: "none" as const };
    if (req.kind === "none") return;

    if (req.kind === "click-target" && currentStep.target) {
      const handler = (ev: MouseEvent) => {
        const el = document.querySelector(currentStep.target!) as HTMLElement | null;
        if (el && ev.target instanceof Node && el.contains(ev.target)) {
          setStepSatisfied(true);
        }
      };
      document.addEventListener("click", handler, true);
      return () => document.removeEventListener("click", handler, true);
    }
    if (req.kind === "progress-event") {
      const handler = (e: Event) => {
        if ((e as CustomEvent).detail === req.event) setStepSatisfied(true);
      };
      window.addEventListener("serpent-progress", handler);
      return () => window.removeEventListener("serpent-progress", handler);
    }
  }, [active, currentStep]);

  const popover = (() => {
    if (!targetRect) return { top: 24, left: window.innerWidth / 2 - 180 };
    const W = 320;
    const margin = 12;
    let left = targetRect.left + targetRect.width + margin;
    let top = targetRect.top;
    if (left + W > window.innerWidth - 8) {
      left = Math.max(8, Math.min(window.innerWidth - W - 8, targetRect.left));
      top = targetRect.top + targetRect.height + margin;
      if (top + 180 > window.innerHeight) top = Math.max(8, targetRect.top - 180 - margin);
    }
    top = Math.max(8, Math.min(window.innerHeight - 180, top));
    return { top, left };
  })();

  const TRIO: { kind: FlowKind; img: string; label: string; done: boolean }[] = [
    { kind: "start",   img: risingSun, label: "Start Serpent",  done: state.startCompleted },
    { kind: "midday",  img: sun,       label: "Midday Check",   done: state.middayCompleted },
    { kind: "evening", img: halfMoon,  label: "Evening Review", done: state.eveningCompleted },
  ];

  return (
    <>
      {/* Permanent trio at bottom center — collapsible to a thin tab */}
      <FlowTrioDock
        trio={TRIO}
        flow={state}
        embedded={embedded}
        tasks={tasks}

        reminders={reminders}
        lifePlanProjects={lifePlanProjects}
        dailySchedule={dailySchedule}
        onStart={startFlow}
        onReset={() => {
          if (!confirm("Reset today's Serpent flow? Start, Midday and Evening will be marked uncompleted and the phase cleared.")) return;
          setState((s) => ({ ...s, startCompleted: false, middayCompleted: false, eveningCompleted: false }));
          setManualPhase(null);
          setActive(null);
          setStepIdx(0);
        }}
        activeFlow={active}
        activeSteps={active ? FLOWS[active].steps : null}
        stepIdx={stepIdx}
        stepSatisfied={stepSatisfied}
        onAdvance={next}
        onCancel={() => { setActive(null); setStepIdx(0); }}
        onJumpToStep={(i) => setStepIdx(i)}
      />

      {/* Highlight ring + anchored tooltip */}
      <AnimatePresence>
        {active && currentStep && (
          <>
            {targetRect && (
              <motion.div
                key="ring"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed pointer-events-none z-40 rounded-lg ring-4 ring-primary ring-offset-2 ring-offset-background animate-pulse-glow"
                style={{
                  top: targetRect.top - 4,
                  left: targetRect.left - 4,
                  width: targetRect.width + 8,
                  height: targetRect.height + 8,
                }}
              />
            )}
            {targetRect && (
              <motion.div
                key="step-tip"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="fixed z-50 max-w-[240px] bg-sidebar/95 border border-amber-300/40 rounded-md shadow-xl px-3 py-2 pointer-events-none"
                style={{ top: popover.top, left: popover.left }}
              >
                <div className="text-[10px] uppercase tracking-wider text-amber-200 font-mono mb-0.5">
                  Step {stepIdx + 1} · {FLOWS[active].label}
                </div>
                <div className="text-xs font-semibold text-white">{currentStep.title}</div>
                {!stepSatisfied && currentStep.hint && (
                  <div className="text-[10px] text-amber-200 mt-1 italic">⏳ {currentStep.hint}</div>
                )}
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================================
// FlowTrioDock — Process & Alarm Center.
// Combines the Serpent flow trio with overdue tasks/reminders/consistency,
// and surfaces life-plan project risk. Turns faded-red with a bell when
// anything needs attention; plays an alarm tone for new alerts.
// ============================================================================
type TrioItem = { kind: FlowKind; img: string; label: string; done: boolean };

interface AlarmItem {
  id: string;
  kind: "flow" | "task" | "consistency" | "reminder" | "project";
  label: string;
  detail?: string;
  severity: "warn" | "overdue";
}

function nowHHMM(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`;
}

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

/** Short rising-tone alert (~1.2s) — distinct from reminder alarm. */
function playAlertChime(ctxRef: { current: AudioContext | null }) {
  try {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime;
    [880, 1175, 1568].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = t0 + i * 0.18;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      o.connect(g); g.connect(ctx.destination);
      o.start(start); o.stop(start + 0.4);
    });
  } catch (e) { /* swallow */ }
}

function FlowTrioDock({
  trio,
  flow,
  embedded = false,
  tasks,
  reminders,
  lifePlanProjects,
  dailySchedule,
  onStart,
  onReset,
  activeFlow,
  activeSteps,
  stepIdx,
  stepSatisfied,
  onAdvance,
  onCancel,
  onJumpToStep,
}: {
  trio: TrioItem[];
  flow: SerpentFlowDayState;
  embedded?: boolean;
  tasks: Task[];
  reminders: Reminder[];
  lifePlanProjects: LifePlanProject[];
  dailySchedule: DailyScheduleSlot[];
  onStart: (k: FlowKind) => void;
  onReset: () => void;
  activeFlow: FlowKind | null;
  activeSteps: Step[] | null;
  stepIdx: number;
  stepSatisfied: boolean;
  onAdvance: () => void;
  onCancel: () => void;
  onJumpToStep: (i: number) => void;
}) {
  const KEY = "serpent-trio-collapsed";
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return !embedded && localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    if (embedded) return;
    try { localStorage.setItem(KEY, collapsed ? "1" : "0"); } catch {}
  }, [collapsed, embedded]);


  const [showPanel, setShowPanel] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const { notifications, dismiss, dismissAll } = useAssignmentNotifications(tasks);
  const notifCount = notifications.length;
  const lastNotifIdsRef = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const [cutoffs, setCutoffs] = useState<FlowCutoffs>(() => loadCutoffs());
  useEffect(() => onCutoffsChange(setCutoffs), []);

  const audioRef = useRef<AudioContext | null>(null);
  const lastAlarmIdsRef = useRef<Set<string>>(new Set());

  // Compute alerts on every render (cheap; lists are small)
  const { alerts, hasOverdue } = useMemo(() => {
    void tick; // re-run on interval
    const out: AlarmItem[] = [];
    const now = new Date();
    const today = todayISO();
    const hm = nowHHMM();

    // Helper: minutes-before-cutoff window for "warn" before going "overdue".
    const sev = (cutoff: string): "warn" | "overdue" | null => {
      if (hm >= cutoff) return "overdue";
      // warn 60 min before cutoff
      const [ch, cm] = cutoff.split(":").map(Number);
      const cutoffMin = ch * 60 + cm;
      const [nh, nm] = hm.split(":").map(Number);
      const nowMin = nh * 60 + nm;
      if (cutoffMin - nowMin <= 60) return "warn";
      return null;
    };

    // Outstanding flows by configured cutoff
    if (!flow.startCompleted) {
      const s = sev(cutoffs.start);
      if (s) out.push({ id: "flow-start", kind: "flow", label: s === "overdue" ? "Start Serpent overdue" : "Start Serpent due soon", detail: `By ${cutoffs.start}`, severity: s });
    }
    if (flow.startCompleted && !flow.middayCompleted) {
      const s = sev(cutoffs.midday);
      if (s) out.push({ id: "flow-midday", kind: "flow", label: s === "overdue" ? "Midday Check overdue" : "Midday Check due soon", detail: `By ${cutoffs.midday}`, severity: s });
    }
    if (!flow.eveningCompleted) {
      const s = sev(cutoffs.evening);
      if (s) out.push({ id: "flow-evening", kind: "flow", label: s === "overdue" ? "Evening Review overdue" : "Evening Review due soon", detail: `By ${cutoffs.evening}`, severity: s });
    }

    // Overdue tasks (with dueTime today, or past dueDate)
    for (const t of tasks) {
      if (t.completed) continue;
      if (t.dueTime && (!t.dueDate || t.dueDate === today)) {
        if (t.dueTime < hm) {
          out.push({ id: `task-${t.id}`, kind: t.recurrence === "daily" ? "consistency" : "task", label: t.title, detail: `Due ${t.dueTime}`, severity: "overdue" });
        }
      } else if (t.dueDate && t.dueDate < today) {
        out.push({ id: `task-${t.id}`, kind: "task", label: t.title, detail: `Was due ${t.dueDate}`, severity: "overdue" });
      }
    }

    // Overdue reminders (not completed, datetime in past)
    for (const r of reminders) {
      if (r.completed) continue;
      const due = new Date(r.datetime).getTime();
      if (due <= now.getTime()) {
        out.push({ id: `rem-${r.id}`, kind: "reminder", label: r.title, detail: `Was due ${new Date(r.datetime).toLocaleString()}`, severity: "overdue" });
      }
    }

    // Life-plan projects at risk: any associated task overdue or > 50% past due-time
    for (const lp of lifePlanProjects) {
      const lpId = `lp-${lp.id}`;
      const projTasks = tasks.filter(t => t.projectId === lpId && !t.completed);
      const overdueCount = projTasks.filter(t =>
        (t.dueDate && t.dueDate < today) ||
        (t.dueTime && (!t.dueDate || t.dueDate === today) && t.dueTime < hm)
      ).length;
      if (overdueCount > 0) {
        out.push({
          id: `proj-${lp.id}`,
          kind: "project",
          label: `${lp.name} at risk`,
          detail: `${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`,
          severity: overdueCount >= 3 ? "overdue" : "warn",
        });
      }
    }

    return { alerts: out, hasOverdue: out.some(a => a.severity === "overdue") };
  }, [tick, flow, tasks, reminders, lifePlanProjects, dailySchedule, cutoffs]);

  // Fire chime when a NEW overdue alert appears
  useEffect(() => {
    const currentIds = new Set(alerts.filter(a => a.severity === "overdue").map(a => a.id));
    const lastIds = lastAlarmIdsRef.current;
    let hasNew = false;
    for (const id of currentIds) if (!lastIds.has(id)) { hasNew = true; break; }
    if (hasNew && currentIds.size > 0) {
      playAlertChime(audioRef);
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const sample = alerts.find(a => a.severity === "overdue");
          if (sample) new Notification("⚠️ Serpent alert", { body: sample.label, tag: sample.id });
        }
      } catch {}
    }
    lastAlarmIdsRef.current = currentIds;
  }, [alerts]);

  // Surface new assignment notifications with a soft chime
  useEffect(() => {
    const currentIds = new Set(notifications.map(n => n.id));
    const lastIds = lastNotifIdsRef.current;
    let hasNew = false;
    for (const id of currentIds) if (!lastIds.has(id)) { hasNew = true; break; }
    if (hasNew && currentIds.size > 0 && lastIds.size > 0) {
      playAlertChime(audioRef);
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const sample = notifications[0];
          if (sample) new Notification(sample.kind === "task" ? "📋 Task assigned to you" : "📝 Note shared with you", { body: sample.label, tag: sample.id });
        }
      } catch {}
    }
    lastNotifIdsRef.current = currentIds;
  }, [notifications]);

  const alertCount = alerts.length;
  const alarmActive = alertCount > 0;
  const hasNotifs = notifCount > 0;
  // Faded red palette when alarming, default sidebar otherwise
  const dockTone = alarmActive
    ? "bg-red-950/70 border-red-400/40 text-red-50"
    : hasNotifs
    ? "bg-indigo-950/70 border-indigo-400/40 text-indigo-50"
    : "bg-sidebar/85 border-amber-300/30 text-white";

  if (collapsed && !embedded) {
    const doneCount = trio.filter(t => t.done).length;
    const pillLabel = alarmActive
      ? `${alertCount} alert${alertCount === 1 ? "" : "s"}`
      : hasNotifs
      ? `${notifCount} new`
      : `Flow ${doneCount}/3`;
    const pillIcon = alarmActive
      ? <Bell size={14} className="text-red-200" />
      : hasNotifs
      ? <UserPlus size={14} className="text-indigo-200" />
      : <span>🐍</span>;
    return (
      <button
        onClick={() => setCollapsed(false)}
        title={alarmActive ? `${alertCount} alert${alertCount === 1 ? "" : "s"}` : hasNotifs ? `${notifCount} new assignment${notifCount === 1 ? "" : "s"}` : "Show command center"}
        className={`fixed bottom-14 left-1/2 -translate-x-1/2 z-40 px-4 py-1 rounded-t-lg backdrop-blur border border-b-0 shadow-lg flex items-center gap-2 hover:opacity-90 transition ${dockTone} ${hasOverdue || hasNotifs ? "animate-pulse" : ""}`}
      >
        {pillIcon}
        <span className="text-xs font-mono uppercase tracking-wider">{pillLabel}</span>
        <ChevronUp size={14} />
      </button>
    );
  }

  return (
    <div className={embedded
      ? `h-full overflow-y-auto scrollbar-thin ${dockTone} border-0 rounded-none`
      : `fixed bottom-16 left-1/2 -translate-x-1/2 z-40 backdrop-blur border rounded-2xl shadow-xl ${dockTone} ${hasOverdue ? "ring-2 ring-red-400/50" : ""}`}>

      {/* Consolidated summary row — opens the single Notifications center */}
      {(alarmActive || hasNotifs) && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("serpent-open-notifications"))}
          className={`w-full flex items-center justify-between gap-2 px-4 py-1.5 border-b border-white/10 text-xs font-medium ${hasOverdue ? "text-red-100" : "text-amber-100"}`}
          title="Open notifications"
        >
          <span className="flex items-center gap-1.5">
            <Bell size={13} className={hasOverdue ? "animate-pulse text-red-200" : "text-amber-200"} />
            {alertCount + notifCount} {alertCount + notifCount === 1 ? "notification" : "notifications"}
            {hasOverdue ? " — overdue" : alarmActive ? " — warning" : ""}
          </span>
          <ChevronUp size={12} />
        </button>
      )}


      {/* Active flow checklist — step-by-step inside the command center */}
      {activeFlow && activeSteps && (
        <div className="px-3 py-2 border-b border-white/10 min-w-[340px] max-w-[420px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider font-mono text-white/70">
              {activeFlow === "start" ? "Start Serpent" : activeFlow === "midday" ? "Midday Check" : "Evening Review"} · {stepIdx + 1}/{activeSteps.length}
            </span>
            <button
              onClick={onCancel}
              className="text-[10px] text-white/50 hover:text-white"
              title="Close checklist"
            >
              <X size={12} />
            </button>
          </div>
          <ol className="space-y-0.5">
            {activeSteps.map((s, i) => {
              const done = i < stepIdx;
              const current = i === stepIdx;
              return (
                <li
                  key={i}
                  className={`flex items-start gap-2 px-1.5 py-1 rounded text-[11px] ${
                    current ? "bg-amber-500/15 text-white" : done ? "text-white/50 line-through" : "text-white/60"
                  }`}
                >
                  <button
                    onClick={() => { if (i < stepIdx) onJumpToStep(i); }}
                    className={`mt-0.5 w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center text-[9px] ${
                      done ? "bg-emerald-500 border-emerald-300 text-white" :
                      current ? "border-amber-300" : "border-white/30"
                    }`}
                    title={done ? "Go back to this step" : ""}
                  >
                    {done ? "✓" : current ? "•" : ""}
                  </button>
                  <span className="flex-1 leading-tight">
                    <span className="font-medium">{i + 1}. {s.title}</span>
                    {current && (
                      <span className="block text-[10px] text-white/70 mt-0.5">{s.body}</span>
                    )}
                    {current && !stepSatisfied && s.hint && (
                      <span className="block text-[10px] text-amber-200 mt-0.5 italic">⏳ {s.hint}</span>
                    )}
                  </span>
                  {current && (
                    <button
                      onClick={onAdvance}
                      disabled={!stepSatisfied}
                      className={`flex-shrink-0 self-center text-[10px] px-2 py-0.5 rounded font-medium transition ${
                        stepSatisfied
                          ? "bg-amber-400 text-black hover:opacity-90"
                          : "bg-white/10 text-white/40 cursor-not-allowed"
                      }`}
                      title={stepSatisfied ? "Mark step complete" : "Complete the action above to unlock"}
                    >
                      {stepSatisfied ? (i + 1 >= activeSteps.length ? "Done" : "Next") : "Locked"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Main row: flow trio + reset + collapse */}
      <div className="flex items-end gap-4 px-4 py-2">
        {trio.map(({ kind, img, label, done }) => (
          <button
            key={kind}
            onClick={() => onStart(kind)}
            title={label + (done ? " — completed" : "")}
            className="group relative flex flex-col items-center gap-1 w-16"
          >
            <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 transition-all ${done ? "border-emerald-400" : alarmActive ? "border-red-300/50 group-hover:border-red-200" : "border-amber-300/50 group-hover:border-amber-300"} group-hover:scale-110`}>
              <img src={img} alt={label} className="w-full h-full object-contain bg-sidebar" />
            </div>
            {done && (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border border-emerald-200 flex items-center justify-center text-[10px] text-white font-bold shadow"
                aria-label="completed"
              >
                ✓
              </span>
            )}
            <span className="text-[9px] text-white/90 text-center leading-tight font-medium whitespace-nowrap">{label}</span>
          </button>
        ))}
        {/* Reset — black for visibility */}
        <button
          onClick={onReset}
          title="Reset today's Serpent status"
          className="ml-2 self-center w-8 h-8 rounded-full bg-black text-white border border-white/30 hover:bg-neutral-900 hover:border-white/60 transition flex items-center justify-center text-sm shadow"
        >
          ↻
        </button>
        {/* Collapse */}
        {!embedded && (
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse alarm center"
            className="self-center w-7 h-7 rounded-full bg-white/5 text-white/70 border border-white/15 hover:text-white hover:border-white/40 transition flex items-center justify-center"
          >
            <ChevronDown size={14} />
          </button>
        )}

      </div>
    </div>
  );
}

