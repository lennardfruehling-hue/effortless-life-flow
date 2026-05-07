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
