import { useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";
import {
  loadFlowState,
  saveFlowState,
  SerpentFlowDayState,
  SerpentPhase,
} from "@/lib/serpentFlowState";
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
      { title: "Open Tasks", body: "Go to the Tasks view to plan your day.", target: '[data-tour="nav-tasks"]', requires: { kind: "click-target" }, hint: "Click the Tasks nav item to continue." },
      { title: "Add Daily Tasks", body: "Use Add Task to drop in today's daily items.", target: '[data-tour="add-task"]', requires: { kind: "click-target" }, hint: "Click Add Task to continue." },
      { title: "Check Tasks", body: "Review urgency on existing tasks (A1/B1).", target: '[data-tour="add-task"]', requires: { kind: "none" } },
      { title: "Open Schedule", body: "Open the 24h Schedule panel.", target: '[data-tour="schedule-toggle"]', requires: { kind: "click-target" }, hint: "Click Schedule to open the panel." },
      { title: "Produce & Complete Schedule", body: "Drag tasks in, set realistic time + buffer, sanity-check it's doable.", target: '[data-tour="schedule-panel"]', requires: { kind: "progress-event", event: "schedule-block-added" }, hint: "Add at least one block to the schedule to continue." },
      { title: "Email schedule", body: "Send the schedule to yourself by email.", target: '[data-tour="email-schedule"]', requires: { kind: "progress-event", event: "schedule-emailed" }, hint: "Click Email schedule to continue." },
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
      { title: "Daily Serpent list · A1", body: "Review and check non-negotiable (Célida · K) items.", target: '[data-tour="nav-consistency"]', requires: { kind: "click-target" }, hint: "Open the Consistency view to continue." },
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

function derivePhase(s: SerpentFlowDayState, active: FlowKind | null, manual: SerpentPhase | null): SerpentPhase {
  if (manual) return manual;
  if (active === "start") return "planning";
  if (active === "evening" || s.eveningCompleted) return "review";
  if (active === "midday" || s.startCompleted) return "action";
  return "idle";
}

export default function SerpentFlow() {
  const [state, setState] = useState<SerpentFlowDayState>(loadFlowState);
  const [active, setActive] = useState<FlowKind | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [trioOpen, setTrioOpen] = useState(false);
  const [manualPhase, setManualPhase] = useState<SerpentPhase | null>(null);
  // Tracks whether the active step's requirement is satisfied.
  const [stepSatisfied, setStepSatisfied] = useState(false);

  // Persist + broadcast phase whenever inputs change.
  useEffect(() => {
    const next = { ...state, phase: derivePhase(state, active, manualPhase) };
    saveFlowState(next);
  }, [state, active, manualPhase]);

  // Listen for manual phase override from the sidebar (user clicks the phase chip).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as SerpentPhase | null;
      setManualPhase(detail || null);
    };
    window.addEventListener("serpent-set-phase", handler);
    return () => window.removeEventListener("serpent-set-phase", handler);
  }, []);

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

  // Auto-prompt sequence: open trio chooser at noon if midday not done, at 17h if evening not done.
  useEffect(() => {
    const tick = () => {
      const h = new Date().getHours();
      if (active) return;
      if (!state.middayCompleted && state.startCompleted && h >= 12 && h < 17) {
        setTrioOpen(true);
      } else if (!state.eveningCompleted && h >= 17) {
        setTrioOpen(true);
      }
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [state, active]);

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

  const showStartHero = !state.startCompleted && !active && !trioOpen;

  const TRIO: { kind: FlowKind; img: string; label: string; done: boolean }[] = [
    { kind: "start",   img: risingSun, label: "Start Serpent",  done: state.startCompleted },
    { kind: "midday",  img: sun,       label: "Midday Check",   done: state.middayCompleted },
    { kind: "evening", img: halfMoon,  label: "Evening Review", done: state.eveningCompleted },
  ];

  return (
    <>
      {/* Floating Start Serpent hero button */}
      <AnimatePresence>
        {showStartHero && (
          <motion.button
            key="start-btn"
            initial={{ opacity: 0, scale: 0.85, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            onClick={() => startFlow("start")}
            className="fixed left-1/2 top-1/4 -translate-x-1/2 z-40 px-10 py-4 rounded-full bg-sidebar/90 backdrop-blur border border-amber-300/40 shadow-2xl text-white flex items-center gap-3 hover:bg-sidebar transition-colors animate-pulse-glow"
            style={{
              fontFamily: "'Great Vibes', 'Allura', cursive",
              fontSize: "2rem",
              lineHeight: 1,
              boxShadow: "0 10px 40px -10px rgba(255,170,60,0.35), 0 0 0 1px rgba(255,200,120,0.15) inset",
            }}
          >
            <span className="text-2xl">🐍</span> Start Serpent
          </motion.button>
        )}
      </AnimatePresence>

      {/* Permanent trio at bottom center */}
      {!active && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-end gap-4 px-4 py-2 rounded-2xl bg-sidebar/85 backdrop-blur border border-amber-300/30 shadow-xl">
          {TRIO.map(({ kind, img, label, done }) => (
            <button
              key={kind}
              onClick={() => startFlow(kind)}
              title={label + (done ? " — completed" : "")}
              className="group relative flex flex-col items-center gap-1 w-16"
            >
              <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 transition-all ${done ? "border-emerald-400" : "border-amber-300/50 group-hover:border-amber-300"} group-hover:scale-110`}>
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
        </div>
      )}

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
            <motion.div
              key="step"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed z-50 w-[320px] bg-card border-2 border-primary rounded-lg shadow-2xl p-4"
              style={{ top: popover.top, left: popover.left }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🐍</span>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                      {FLOWS[active].label} · Step {stepIdx + 1} of {FLOWS[active].steps.length}
                    </div>
                    <div className="text-sm font-semibold text-foreground">{currentStep.title}</div>
                  </div>
                </div>
                <button onClick={() => setActive(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{currentStep.body}</p>
              <button
                onClick={next}
                className="w-full flex items-center justify-center gap-1 bg-primary text-primary-foreground rounded px-3 py-2 text-xs font-medium hover:opacity-90"
              >
                {stepIdx + 1 >= FLOWS[active].steps.length ? "Complete" : "Next"} <ChevronRight size={14} />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
