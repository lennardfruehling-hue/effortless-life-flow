import { useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";

type FlowKind = "start" | "midday" | "evening";

interface Step {
  title: string;
  body: string;
  /** CSS selector of the element this step targets. */
  target?: string;
}

const FLOWS: Record<FlowKind, { label: string; steps: Step[] }> = {
  start: {
    label: "Start Serpent 🐍",
    steps: [
      { title: "Open Tasks", body: "Go to the Tasks view to plan your day.", target: '[data-tour="nav-tasks"]' },
      { title: "Add Daily Tasks", body: "Use Add Task to drop in today's daily items.", target: '[data-tour="add-task"]' },
      { title: "Check Tasks", body: "Review urgency on existing tasks (A1/B1).", target: '[data-tour="add-task"]' },
      { title: "Open Schedule", body: "Open the 24h Schedule panel.", target: '[data-tour="schedule-toggle"]' },
      { title: "Produce & Complete Schedule", body: "Drag tasks in, set realistic time + buffer, sanity-check it's doable.", target: '[data-tour="schedule-panel"]' },
      { title: "Email schedule", body: "Send the schedule to yourself by email.", target: '[data-tour="email-schedule"]' },
    ],
  },
  midday: {
    label: "Midday Check 🐍",
    steps: [
      { title: "Daily Serpent list · A1", body: "Check progress on A1 daily items.", target: '[data-tour="nav-consistency"]' },
    ],
  },
  evening: {
    label: "Evening Check 🐍",
    steps: [
      { title: "Daily Serpent list · A1", body: "Review and check non-negotiable (Célida · K) items.", target: '[data-tour="nav-consistency"]' },
    ],
  },
};

const STORAGE_KEY = "serpent-flow-state-v1";

interface FlowState {
  date: string;
  startCompleted: boolean;
  middayCompleted: boolean;
  eveningCompleted: boolean;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadState(): FlowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as FlowState;
      if (s.date === todayKey()) return s;
    }
  } catch {}
  return { date: todayKey(), startCompleted: false, middayCompleted: false, eveningCompleted: false };
}

function saveState(s: FlowState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function useTargetRect(selector: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        setRect(null);
      } else {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        // ensure it's in view
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    };
    measure();
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
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

export default function SerpentFlow() {
  const [state, setState] = useState<FlowState>(loadState);
  const [active, setActive] = useState<FlowKind | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => saveState(state), [state]);

  const startFlow = (kind: FlowKind) => {
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

  const hour = new Date().getHours();
  const showStart = !state.startCompleted;
  const showMidday = state.startCompleted && !state.middayCompleted && hour >= 11 && hour < 17;
  const showEvening = !state.eveningCompleted && hour >= 17;

  const currentStep = active ? FLOWS[active].steps[stepIdx] : undefined;
  const targetRect = useTargetRect(currentStep?.target);

  // Compute popover position: prefer right side; fall back below; clamp to viewport.
  const popover = (() => {
    if (!targetRect) return { top: 24, left: window.innerWidth / 2 - 180 };
    const W = 320;
    const margin = 12;
    let left = targetRect.left + targetRect.width + margin;
    let top = targetRect.top;
    if (left + W > window.innerWidth - 8) {
      // place below or above
      left = Math.max(8, Math.min(window.innerWidth - W - 8, targetRect.left));
      top = targetRect.top + targetRect.height + margin;
      if (top + 180 > window.innerHeight) {
        top = Math.max(8, targetRect.top - 180 - margin);
      }
    }
    top = Math.max(8, Math.min(window.innerHeight - 180, top));
    return { top, left };
  })();

  return (
    <>
      {/* Floating Start Serpent button */}
      <AnimatePresence>
        {showStart && !active && (
          <motion.button
            key="start-btn"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => startFlow("start")}
            className="fixed left-1/2 top-1/3 -translate-x-1/2 z-40 px-8 py-5 rounded-full bg-primary text-primary-foreground shadow-2xl text-xl font-semibold flex items-center gap-3 animate-pulse-glow"
          >
            <span className="text-2xl">🐍</span> Start Serpent
          </motion.button>
        )}
      </AnimatePresence>

      {/* Midday & Evening prompts */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 items-end">
        {showMidday && !active && (
          <button
            onClick={() => startFlow("midday")}
            className="px-3 py-2 rounded-md bg-cat-a/90 text-white text-xs shadow-lg hover:opacity-90"
          >
            🐍 Midday check
          </button>
        )}
        {showEvening && !active && (
          <button
            onClick={() => startFlow("evening")}
            className="px-3 py-2 rounded-md bg-cat-k/90 text-white text-xs shadow-lg hover:opacity-90"
          >
            🐍 Evening check
          </button>
        )}
      </div>

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
