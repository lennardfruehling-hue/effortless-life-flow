import { useMemo } from "react";
import { Task } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { Check, Zap, Clock, Calendar, Pencil } from "lucide-react";

interface Props {
  tasks: Task[];
  onToggle: (id: string) => void;
  onEdit: (task: Task) => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Score a task for "what is the immediate next step".
 * Philosophy: don't look far ahead — the plan already exists. Only the very next
 * concrete move matters. So: overdue > time-bound today > A1 > quick win > rest.
 */
function immediacyScore(t: Task, nowMinutes: number): number {
  const today = todayISO();
  let s = 0;
  if (t.dueDate && t.dueDate < today) s += 1000 - Math.min(200, (Date.now() - +new Date(t.dueDate)) / 86400000);
  if (t.dueDate === today) s += 600;
  if (t.dueTime && t.dueDate === today) {
    const [h, m] = t.dueTime.split(":").map(Number);
    const mins = h * 60 + m;
    s += 400 - Math.min(400, Math.abs(mins - nowMinutes));
  }
  if (t.categories.includes("A1")) s += 500;
  if (t.categories.includes("K")) s += 300;
  if (t.categories.includes("B1")) s += 250;
  if (t.categories.includes("B2")) s += 120;
  if (t.categories.includes("C")) s += 90; // quick win — easy immediate move
  if (t.categories.includes("A2")) s += 60;
  if (t.recurrence === "daily") s += 40;
  if (t.categories.includes("A3")) s -= 80;
  if (t.categories.includes("I")) s -= 120;
  return s;
}

function reasonFor(t: Task): string {
  const today = todayISO();
  if (t.dueDate && t.dueDate < today) return "Overdue — a date you committed to. Clear it before anything else.";
  if (t.dueTime && t.dueDate === today) return `Time-bound today at ${t.dueTime}. This is your window.`;
  if (t.dueDate === today) return "Due today — it was put on the list, so it happens today.";
  if (t.categories.includes("A1")) return "A1 — today's non-negotiable. Nothing later matters until this is done.";
  if (t.categories.includes("K")) return "Non-negotiable commitment. Take the next step now.";
  if (t.categories.includes("C")) return "Quick win — the fastest way to make the plan real right now.";
  return "The nearest concrete step in your plan. Do this one, then look again.";
}

/**
 * "Immediate task" — one single next action, never a horizon.
 */
export default function ImmediateTask({ tasks, onToggle, onEdit }: Props) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const task = useMemo(() => {
    const open = tasks.filter((t) => !t.completed);
    if (open.length === 0) return null;
    return [...open].sort((a, b) => immediacyScore(b, nowMinutes) - immediacyScore(a, nowMinutes))[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, nowMinutes]);

  if (!task) {
    return (
      <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 mb-4">
        <p className="text-[11px] uppercase tracking-widest font-mono text-emerald-700">Immediate task</p>
        <p className="text-sm text-foreground mt-1">Nothing open. Plan the next step — then do only that.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card px-4 py-3 mb-4">
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-primary shrink-0" />
        <p className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Immediate task</p>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">next step only</span>
      </div>

      <div className="flex items-start gap-3 mt-2">
        <button
          onClick={() => onToggle(task.id)}
          title="Mark done"
          className="mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 border-primary/60 flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <Check size={13} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground leading-snug break-words">{task.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{reasonFor(task)}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {task.categories.map((c) => (
              <CategoryBadge key={c} category={c} small />
            ))}
            {task.dueDate && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground">
                <Calendar size={10} /> {task.dueDate}
              </span>
            )}
            {task.dueTime && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground">
                <Clock size={10} /> {task.dueTime}
              </span>
            )}
            {task.duration && (
              <span className="text-[10px] font-mono text-muted-foreground">{task.duration} min</span>
            )}
          </div>
        </div>
        <button
          onClick={() => onEdit(task)}
          title="Edit"
          className="p-1 text-muted-foreground hover:text-foreground shrink-0"
        >
          <Pencil size={14} />
        </button>
      </div>
    </section>
  );
}
