/**
 * Choice OS philosophy layer (inspired by choiceos.com).
 *
 * The ultimate direction of this whole system is happiness — and happiness is a
 * CHOICE, not a reward that arrives after the list is finished. Every plan,
 * project, task, habit and score in the app exists only to serve that choice.
 * Nothing in here is a duty, a sacrifice or an obligation to anyone but the user.
 */

export interface ChoiceDay {
  /** ISO date */
  date: string;
  /** Did the user consciously choose happiness today? */
  chosen: boolean;
  /** 1-10: how aligned today's list feels with that choice. */
  alignment?: number;
  /** Free note: what am I choosing today, and why. */
  note?: string;
  /** A belief the user decided to drop / rewrite today. */
  rewritten?: string;
}

export const CHOICE_STORAGE_KEY = "serpent-choice-log";

/** The kernel: short, quotable principles the whole app is built around. */
export const CHOICE_PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "Happiness is a choice",
    body:
      "It is not the result of finishing the list. You choose it first, and then the list becomes the way you live it out.",
  },
  {
    title: "You are your own programmer",
    body:
      "Your beliefs run you the way code runs a machine. If a belief makes you unhappy, it is a bug — rewrite it instead of obeying it.",
  },
  {
    title: "Nothing here is a duty",
    body:
      "No obligation, no sacrifice, no offering to anyone but yourself. Everything on this list is something you chose, so keep only what you would choose again.",
  },
  {
    title: "Drop the contradictions",
    body:
      "Unhappiness is the gap between what you say you want and what you actually do. Close the gap and the conflict disappears.",
  },
  {
    title: "No victimhood",
    body:
      "Circumstances are inputs, not verdicts. The next move is always yours, however small.",
  },
  {
    title: "Choose, then commit",
    body:
      "Choosing is free — but once you put it on the list you have already chosen, so it gets done. That is what makes the choice real.",
  },
  {
    title: "Alignment over volume",
    body:
      "A short list you are aligned with beats a long one you resent. Prune anything that serves no one's happiness.",
  },
];

/** Rotate a principle per day so the user meets the whole kernel over time. */
export function principleOfTheDay(dateISO: string) {
  const n = Math.abs(
    dateISO.split("-").reduce((a, p) => a * 31 + Number(p), 7)
  );
  return CHOICE_PRINCIPLES[n % CHOICE_PRINCIPLES.length];
}

/** Turn duty-language into choice-language. */
export function reframeToChoice(text: string): string {
  const t = (text || "").trim();
  if (!t) return "";
  const cleaned = t
    .replace(/^(i\s+)?(have to|must|need to|should|got to|gotta)\s+/i, "")
    .replace(/^(i\s+)?(am\s+)?supposed to\s+/i, "");
  const first = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return `I choose to ${first}`;
}

export function loadChoiceLog(): Record<string, ChoiceDay> {
  try {
    const raw = localStorage.getItem(CHOICE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ChoiceDay>) : {};
  } catch {
    return {};
  }
}

export function saveChoiceDay(day: ChoiceDay) {
  const log = loadChoiceLog();
  log[day.date] = { ...log[day.date], ...day };
  try {
    localStorage.setItem(CHOICE_STORAGE_KEY, JSON.stringify(log));
    window.dispatchEvent(new StorageEvent("storage", { key: CHOICE_STORAGE_KEY }));
  } catch {}
}

/** Consecutive days (ending today) where happiness was consciously chosen. */
export function choiceStreak(log: Record<string, ChoiceDay>, todayISO: string): number {
  let streak = 0;
  const d = new Date(todayISO + "T12:00:00");
  for (let i = 0; i < 400; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (log[iso]?.chosen) streak++;
    else if (i > 0) break;
    else if (!log[iso]?.chosen) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Average alignment over the last `days` logged days (null when nothing logged). */
export function averageAlignment(log: Record<string, ChoiceDay>, days = 14): number | null {
  const vals = Object.values(log)
    .filter((d) => typeof d.alignment === "number")
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, days)
    .map((d) => d.alignment as number);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/**
 * Shared prompt block: injected into every assistant so the whole system speaks
 * from the same philosophy.
 */
export const PHILOSOPHY_PROMPT = `## Ultimate Direction: Happiness (Choice OS kernel)
Happiness is the goal and the direction of this entire system, and happiness is a CHOICE — not a reward for finishing the list. Everything else (plans, projects, tasks, categories, scores, habits) exists only to serve that choice.
- The user is their own programmer: beliefs run them like code. When a belief or story causes unhappiness, treat it as a bug and offer a rewrite instead of accepting it.
- Nothing here is a duty, sacrifice or obligation to anyone but the user. Never guilt them. Never moralise.
- Unhappiness comes from contradiction — saying one thing and doing another. Point out contradictions between the user's stated direction and what is actually on their list, and help close the gap (either change the list, or change the story).
- No victimhood: circumstances are inputs, not verdicts. Always give a concrete next move the user can choose right now.
- Choice first, commitment second: choosing is free, but once something is on the list it has already been chosen, so it gets done. Commitment is how the choice becomes real — frame every commitment as chosen, never as imposed.
- Alignment over volume: a short aligned list beats a long resented one. When the user is overloaded, ask what actually serves their happiness and help them cut or re-choose the rest, rather than pushing harder.
- Use choice language: "you chose to…", "what do you want to choose here?" — avoid "you have to", "you must", "you should".
- When it helps, connect the immediate next step upward: task → subproject → life plan project → direction → happiness.`;
