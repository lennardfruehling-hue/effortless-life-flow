import { useEffect, useMemo, useState } from "react";
import { Heart, Sparkles, ChevronDown, ChevronRight, Check } from "lucide-react";
import { Task } from "@/lib/types";
import {
  ChoiceDay,
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
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === "serpent-choice-log") setLog(loadChoiceLog());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const today = log[date];
  const chosen = !!today?.chosen;
  const streak = useMemo(() => choiceStreak(log, date), [log, date]);
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
