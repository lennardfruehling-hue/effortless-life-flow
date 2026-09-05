import { useEffect, useMemo, useState } from "react";
import { Heart, Sparkles, ChevronDown, ChevronRight, Check } from "lucide-react";
import { Task } from "@/lib/types";
import {
  ChoiceDay,
  averageAlignment,
  choiceStreak,
  loadChoiceLog,
  principleOfTheDay,
  reframeToChoice,
  saveChoiceDay,
} from "@/lib/philosophy";

const todayISO = () => new Date().toISOString().slice(0, 10);
const OPEN_KEY = "serpent-choice-open";

interface Props {
  tasks: Task[];
  /** The 6-year direction / top life plan priority, if known. */
  direction?: string;
}

/**
 * The Happiness Compass — the top of the system.
 * Happiness is a choice; the list underneath is only how that choice gets lived.
 */
export default function HappinessCompass({ tasks, direction }: Props) {
  const date = todayISO();
  const [log, setLog] = useState<Record<string, ChoiceDay>>(() => loadChoiceLog());
  const [open, setOpen] = useState<boolean>(() => localStorage.getItem(OPEN_KEY) !== "0");
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    setNote(log[date]?.note ?? "");
  }, [date, log]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === "serpent-choice-log") setLog(loadChoiceLog());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const today = log[date];
  const chosen = !!today?.chosen;
  const alignment = today?.alignment;
  const streak = useMemo(() => choiceStreak(log, date), [log, date]);
  const avg = useMemo(() => averageAlignment(log), [log]);
  const principle = useMemo(() => principleOfTheDay(date), [date]);

  const nextStep = useMemo(() => {
    const open = tasks.filter((t) => !t.completed);
    return (
      open.find((t) => t.categories.includes("A1")) ??
      open.find((t) => t.dueDate === date) ??
      open[0]
    );
  }, [tasks, date]);

  const update = (patch: Partial<ChoiceDay>) => {
    saveChoiceDay({ date, chosen, ...patch });
    setLog(loadChoiceLog());
  };

  const toggleOpen = () => {
    setOpen((o) => {
      localStorage.setItem(OPEN_KEY, o ? "0" : "1");
      return !o;
    });
  };

  return (
    <section className="mb-4 rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={toggleOpen}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
        aria-expanded={open}
      >
        <Heart size={16} className={chosen ? "text-primary fill-primary" : "text-muted-foreground"} />
        <span className="text-sm font-semibold text-foreground">Happiness is a choice</span>
        {chosen ? (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
            chosen today{streak > 1 ? ` · ${streak}d` : ""}
          </span>
        ) : (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">not chosen yet</span>
        )}
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* The choice */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => update({ chosen: !chosen })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                chosen
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/70"
              }`}
            >
              <Check size={14} />
              {chosen ? "I chose happiness today" : "I choose happiness today"}
            </button>
            {avg !== null && (
              <span className="text-[11px] text-muted-foreground">14-day alignment {avg}/10</span>
            )}
          </div>

          {/* Direction */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Everything below serves this choice
            {direction ? (
              <>
                {" "}— today's list ladders up to{" "}
                <span className="text-foreground font-medium">{direction}</span>.
              </>
            ) : (
              "."
            )}{" "}
            Nothing here is a duty; it is all something you chose.
          </p>

          {/* Next step, in choice language */}
          {nextStep && (
            <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                Your next choice
              </div>
              <div className="text-sm text-foreground font-medium">{reframeToChoice(nextStep.title)}</div>
            </div>
          )}

          {/* Alignment */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                How aligned does today's list feel?
              </span>
              <span className="text-xs font-mono text-foreground">{alignment ?? "–"}/10</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => update({ alignment: n })}
                  aria-label={`Alignment ${n} of 10`}
                  className={`h-6 flex-1 rounded text-[10px] font-medium transition-colors ${
                    alignment && n <= alignment
                      ? "bg-primary/80 text-primary-foreground"
                      : "bg-muted hover:bg-muted/70 text-muted-foreground"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {typeof alignment === "number" && alignment <= 5 && (
              <p className="mt-1.5 text-[11px] text-destructive">
                Low alignment is a contradiction, not a failure. Cut or re-choose what you resent — a short
                aligned list beats a long one.
              </p>
            )}
          </div>

          {/* Note / belief rewrite */}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => update({ note })}
            placeholder="What am I choosing today — and which belief am I rewriting?"
            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 outline-none focus:border-primary"
          />

          {/* Kernel principle of the day */}
          <div className="flex gap-2 items-start text-xs text-muted-foreground border-t border-border pt-2">
            <Sparkles size={13} className="mt-0.5 flex-shrink-0 text-primary" />
            <span>
              <span className="text-foreground font-medium">{principle.title}.</span> {principle.body}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
