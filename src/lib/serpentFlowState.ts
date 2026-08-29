// Shared per-day state for the Serpent flow (Start / Midday / Evening).
// Persisted in localStorage, broadcast via a CustomEvent so any component can react.

export type SerpentPhase = "idle" | "planning" | "action" | "review";

export interface SerpentFlowDayState {
  date: string; // YYYY-MM-DD
  startCompleted: boolean;
  middayCompleted: boolean;
  eveningCompleted: boolean;
  phase: SerpentPhase;
}

const KEY = "serpent-flow-state-v2";
const EVENT = "serpent-flow-change";

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadFlowState(): SerpentFlowDayState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as SerpentFlowDayState;
      if (s.date === todayKey()) return { phase: "idle", ...s };
    }
  } catch {}
  return {
    date: todayKey(),
    startCompleted: false,
    middayCompleted: false,
    eveningCompleted: false,
    phase: "idle",
  };
}

export function saveFlowState(s: SerpentFlowDayState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: s }));
}

export function onFlowStateChange(cb: (s: SerpentFlowDayState) => void) {
  const handler = (e: Event) => cb((e as CustomEvent).detail as SerpentFlowDayState);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function phaseLabel(p: SerpentPhase): string {
  switch (p) {
    case "planning": return "In Planning";
    case "action": return "In Action";
    case "review": return "In Review";
    default: return "Idle";
  }
}

/**
 * Automatic phase for the day, derived from the clock and what has been
 * completed. The flow is mandatory, so the phase is never "idle":
 *  - morning / start not done  → Plan
 *  - midday until evening      → Act
 *  - from 17:00 or after the evening review → Review
 */
export function autoPhase(s: SerpentFlowDayState, now: Date = new Date()): SerpentPhase {
  const h = now.getHours() + now.getMinutes() / 60;
  if (s.eveningCompleted) return "review";
  if (h >= 17) return "review";
  if (!s.startCompleted) return "planning";
  if (h < 12) return "action";
  return "action";
}

/** Which flow step is mandatory right now (null when all are done for today). */
export function mandatoryFlow(s: SerpentFlowDayState, now: Date = new Date()): "start" | "midday" | "evening" | null {
  const h = now.getHours() + now.getMinutes() / 60;
  if (!s.startCompleted) return "start";
  if (!s.middayCompleted && h >= 12) return "midday";
  if (!s.eveningCompleted && h >= 17) return "evening";
  return null;
}

