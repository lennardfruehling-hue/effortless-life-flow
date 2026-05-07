import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";

type FlowKind = "start" | "midday" | "evening";

interface Step {
  title: string;
  body: string;
}

const FLOWS: Record<FlowKind, { label: string; steps: Step[] }> = {
  start: {
    label: "Start Serpent 🐍",
    steps: [
      { title: "Tasks · Add Daily Tasks", body: "Open Tasks and add today's daily tasks." },
      { title: "Check Tasks", body: "Review urgency of existing tasks (A1/B1)." },
      { title: "Add Tasks", body: "Add any additional tasks for today." },
      { title: "Produce Schedule", body: "Open the 24h Schedule and place tasks with realistic time + buffer." },
      { title: "Complete Schedule", body: "Sanity-check: is the day actually doable?" },
      { title: "Send task list per email", body: "Use the Email schedule button in the Schedule panel." },
    ],
  },
  midday: {
    label: "Midday Check 🐍",
    steps: [
      { title: "Daily Serpent list · A1", body: "Check daily serpent list for progress on A1 items." },
    ],
  },
  evening: {
    label: "Evening Check 🐍",
    steps: [
      { title: "Daily Serpent list · A1", body: "Review daily serpent list and check non-negotiable (Célida · K) items." },
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
      // complete
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

  return (
    <>
      {/* Floating Start Serpent button — center of screen on first show */}
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

      {/* Midday & Evening prompts as small bottom-right tooltips */}
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

      {/* Step tooltip overlay */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="step"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-card border-2 border-primary rounded-lg shadow-2xl p-4"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🐍</span>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                    {FLOWS[active].label} · Step {stepIdx + 1} of {FLOWS[active].steps.length}
                  </div>
                  <div className="text-sm font-semibold text-foreground">{FLOWS[active].steps[stepIdx].title}</div>
                </div>
              </div>
              <button onClick={() => setActive(null)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{FLOWS[active].steps[stepIdx].body}</p>
            <button
              onClick={next}
              className="w-full flex items-center justify-center gap-1 bg-primary text-primary-foreground rounded px-3 py-2 text-xs font-medium hover:opacity-90"
            >
              {stepIdx + 1 >= FLOWS[active].steps.length ? "Complete" : "Next"} <ChevronRight size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
