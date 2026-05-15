// Cutoff times for the three Serpent flow checks. User-configurable in Settings.
// Stored in localStorage as HH:MM (24h).

export interface FlowCutoffs {
  start: string;   // Start Serpent must be done by
  midday: string;  // Midday Check must be done by
  evening: string; // Evening Review must be done by
}

const KEY = "serpent-flow-cutoffs";

export const DEFAULT_CUTOFFS: FlowCutoffs = {
  start: "10:00",
  midday: "13:00",
  evening: "21:20",
};

const isHHMM = (s: unknown): s is string =>
  typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function loadCutoffs(): FlowCutoffs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CUTOFFS };
    const parsed = JSON.parse(raw);
    return {
      start:   isHHMM(parsed?.start)   ? parsed.start   : DEFAULT_CUTOFFS.start,
      midday:  isHHMM(parsed?.midday)  ? parsed.midday  : DEFAULT_CUTOFFS.midday,
      evening: isHHMM(parsed?.evening) ? parsed.evening : DEFAULT_CUTOFFS.evening,
    };
  } catch {
    return { ...DEFAULT_CUTOFFS };
  }
}

export function saveCutoffs(c: FlowCutoffs) {
  localStorage.setItem(KEY, JSON.stringify(c));
  window.dispatchEvent(new CustomEvent("serpent-flow-cutoffs-changed", { detail: c }));
}

/** Subscribe to cutoff changes (same tab via custom event, other tabs via storage event). */
export function onCutoffsChange(cb: (c: FlowCutoffs) => void): () => void {
  const handler = () => cb(loadCutoffs());
  window.addEventListener("serpent-flow-cutoffs-changed", handler as EventListener);
  const storage = (e: StorageEvent) => { if (e.key === KEY) cb(loadCutoffs()); };
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("serpent-flow-cutoffs-changed", handler as EventListener);
    window.removeEventListener("storage", storage);
  };
}

// ---- Phase toggle visibility (Plan/Act/Review pills in the sidebar) ----
const PHASE_TOGGLE_KEY = "serpent-phase-toggle-visible";
const PHASE_TOGGLE_EVENT = "serpent-phase-toggle-visibility-changed";

export function loadPhaseToggleVisible(): boolean {
  try {
    const raw = localStorage.getItem(PHASE_TOGGLE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function savePhaseToggleVisible(v: boolean) {
  localStorage.setItem(PHASE_TOGGLE_KEY, String(v));
  window.dispatchEvent(new CustomEvent(PHASE_TOGGLE_EVENT, { detail: v }));
}

export function onPhaseToggleVisibleChange(cb: (v: boolean) => void): () => void {
  const handler = () => cb(loadPhaseToggleVisible());
  window.addEventListener(PHASE_TOGGLE_EVENT, handler as EventListener);
  const storage = (e: StorageEvent) => { if (e.key === PHASE_TOGGLE_KEY) cb(loadPhaseToggleVisible()); };
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(PHASE_TOGGLE_EVENT, handler as EventListener);
    window.removeEventListener("storage", storage);
  };
}
