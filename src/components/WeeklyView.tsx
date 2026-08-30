import { useEffect, useMemo, useState } from "react";
import { Task, WeeklyStructureBlock } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { ChevronLeft, ChevronRight, CalendarRange, Inbox, Repeat, CheckCircle2, Check } from "lucide-react";
import { setDragTaskId, touchDragProps, TOUCH_DROP_EVENT, TouchDropDetail } from "@/lib/dragTask";

interface Props {
  tasks: Task[];
  onSave: (tasks: Task[]) => void;
  structure?: WeeklyStructureBlock[];
  onEditTask?: (task: Task) => void;
  /** Rendered inside the tasks page (tighter spacing) vs. the full calendar page. */
  compact?: boolean;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Monday of the week containing `base`, shifted by `weekOffset` weeks. */
function startOfWeek(base: Date, weekOffset = 0) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow + weekOffset * 7);
  return d;
}
function prettyRange(days: Date[]) {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(days[0])} – ${fmt(days[6])}`;
}

export default function WeeklyView({ tasks, onSave, structure = [], onEditTask, compact = false }: Props) {
  const [offset, setOffset] = useState<0 | 1>(() => {
    try {
      return localStorage.getItem("serpent-weekly-view-offset") === "1" ? 1 : 0;
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    try { localStorage.setItem("serpent-weekly-view-offset", String(offset)); } catch { /* ignore */ }
  }, [offset]);

  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(new Date(), offset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [offset]);

  const dayKeys = days.map(ymd);
  const todayStr = ymd(new Date());
  const weekStart = dayKeys[0];
  const weekEnd = dayKeys[6];

  // --- Buckets -------------------------------------------------------------
  const byDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    dayKeys.forEach((k) => (map[k] = []));
    for (const t of tasks) {
      if (t.recurrence && t.recurrence !== "weekly") continue;
      if (!t.dueDate) continue;
      const key = t.dueDate.slice(0, 10);
      if (map[key]) map[key].push(t);
    }
    Object.values(map).forEach((list) =>
      list.sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueTime || "99:99").localeCompare(b.dueTime || "99:99"))
    );
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, weekStart]);

  /** "This week" tasks that have no date yet — the unscheduled tray. */
  const unscheduled = useMemo(
    () =>
      tasks.filter(
        (t) => !t.recurrence && !t.completed && !t.dueDate && t.categories.includes("A2")
      ),
    [tasks]
  );

  const weeklyRecurring = useMemo(
    () => tasks.filter((t) => t.recurrence === "weekly" && !t.dueDate),
    [tasks]
  );


  const structureByDay = useMemo(() => {
    const map: Record<number, WeeklyStructureBlock[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    for (const b of structure) {
      const idx = (b.dayOfWeek + 6) % 7; // convert Sun=0 → Mon=0
      if (b.recurring === false && b.pinnedDate) {
        const pos = dayKeys.indexOf(b.pinnedDate);
        if (pos >= 0) map[pos].push(b);
      } else {
        map[idx].push(b);
      }
    }
    Object.values(map).forEach((l) => l.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure, weekStart]);

  const scheduledCount = dayKeys.reduce((n, k) => n + byDay[k].filter((t) => !t.completed).length, 0);

  // --- Scheduling ----------------------------------------------------------
  const scheduleTask = (taskId: string, date: string | null) => {
    onSave(
      tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              dueDate: date ?? undefined,
              // Keeping a dated task tagged "this week" keeps it visible in weekly planning.
              categories:
                date && date >= weekStart && date <= weekEnd && !t.categories.includes("A2") && !t.categories.includes("A1")
                  ? [...t.categories, "A2" as const]
                  : t.categories,
            }
          : t
      )
    );
  };

  // Touch fallback: figure out which drop zone the finger was released over.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TouchDropDetail>).detail;
      if (!detail) return;
      const el = document.elementFromPoint(detail.clientX, detail.clientY) as HTMLElement | null;
      const zone = el?.closest("[data-week-drop]") as HTMLElement | null;
      if (!zone) return;
      const value = zone.dataset.weekDrop!;
      scheduleTask(detail.taskId, value === "unscheduled" ? null : value);
    };
    window.addEventListener(TOUCH_DROP_EVENT, handler);
    return () => window.removeEventListener(TOUCH_DROP_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const dropProps = (value: string) => ({
    "data-week-drop": value,
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget !== value) setDropTarget(value);
    },
    onDragLeave: () => setDropTarget((cur) => (cur === value ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const id = e.dataTransfer.getData("text/serpent-task") || e.dataTransfer.getData("text/plain");
      if (id) scheduleTask(id, value === "unscheduled" ? null : value);
      setDragTaskId(null);
    },
  });

  const toggleComplete = (id: string) => {
    onSave(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const TaskChip = ({ t, showTime }: { t: Task; showTime?: boolean }) => (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/serpent-task", t.id);
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
        setDragTaskId(t.id);
      }}
      onDragEnd={() => setDragTaskId(null)}
      {...touchDragProps(t.id)}
      className={`group cursor-grab active:cursor-grabbing rounded-md border px-1.5 py-1 text-[11px] leading-tight transition-colors ${
        t.completed
          ? "border-border bg-muted/40 text-muted-foreground line-through"
          : "border-border bg-card hover:border-primary/40 text-foreground"
      }`}
      title="Drag to another day to change its due date"
    >
      <div className="flex items-start gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); toggleComplete(t.id); }}
          aria-label={t.completed ? "Mark as not done" : "Mark as done"}
          className={`mt-[1px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
            t.completed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary"
          }`}
        >
          {t.completed && <Check size={9} />}
        </button>
        <span className="line-clamp-2 flex-1 cursor-pointer" onClick={() => onEditTask?.(t)}>{t.title}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {showTime && t.dueTime && <span className="font-mono text-[10px] text-muted-foreground">{t.dueTime}</span>}
        {t.recurrence === "weekly" && (
          <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-primary"><Repeat size={9} /> wk</span>
        )}
        {t.categories.slice(0, 2).map((c) => (
          <CategoryBadge key={c} category={c} />
        ))}
      </div>
    </div>
  );


  return (
    <div className={`rounded-lg border border-border bg-card ${compact ? "p-3" : "p-4"}`}>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <CalendarRange size={15} className="text-primary" /> Weekly View
        </span>
        <span className="text-xs text-muted-foreground">{prettyRange(days)}</span>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5">
          <button
            onClick={() => setOffset(0)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              offset === 0 ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ChevronLeft size={12} /> This week
          </button>
          <button
            onClick={() => setOffset(1)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              offset === 1 ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Next week <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Unscheduled tray */}
      <div
        {...dropProps("unscheduled")}
        className={`mb-3 rounded-md border border-dashed p-2 transition-colors ${
          dropTarget === "unscheduled" ? "border-primary bg-primary/5" : "border-border bg-secondary/30"
        }`}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <Inbox size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">This week · no day yet</span>
          <span className="font-mono text-[11px] text-muted-foreground">{unscheduled.length}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">Drag onto a day to set its due date</span>
        </div>
        {unscheduled.length === 0 ? (
          <p className="py-1 text-[11px] text-muted-foreground">
            Nothing floating — every “This Week” task has a day. Drop a task here to clear its date.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((t) => (
              <div key={t.id} className="w-40 max-w-full">
                <TaskChip t={t} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d, i) => {
          const key = dayKeys[i];
          const isToday = key === todayStr;
          const dayTasks = byDay[key];
          const blocks = structureByDay[i];
          return (
            <div
              key={key}
              {...dropProps(key)}
              className={`flex min-h-[140px] flex-col rounded-md border p-1.5 transition-colors ${
                dropTarget === key
                  ? "border-primary bg-primary/5"
                  : isToday
                  ? "border-primary/40 bg-primary/[0.04]"
                  : "border-border bg-background"
              }`}
            >
              <div className="mb-1.5 flex items-baseline gap-1">
                <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                  {DAY_LABELS[i]}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{d.getDate()}</span>
                {dayTasks.length > 0 && (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{dayTasks.length}</span>
                )}
              </div>

              {/* Weekly structure blocks */}
              {blocks.length > 0 && (
                <div className="mb-1.5 space-y-0.5">
                  {blocks.map((b) => (
                    <div
                      key={`${b.id}-${key}`}
                      className="truncate rounded-sm bg-secondary px-1 py-0.5 text-[10px] text-muted-foreground"
                      title={`${b.startTime}–${b.endTime} ${b.label ?? ""}`}
                    >
                      <span className="font-mono">{b.startTime}</span>{" "}
                      {b.label || tasks.find((t) => t.id === b.taskId)?.title || "Structure"}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex-1 space-y-1">
                {dayTasks.map((t) => (
                  <TaskChip key={t.id} t={t} showTime />
                ))}
                {dayTasks.length === 0 && (
                  <p className="pt-1 text-[10px] text-muted-foreground/70">Drop here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly recurring band */}
      {weeklyRecurring.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-secondary/30 p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Repeat size={12} className="text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Every week · no day yet</span>
            <span className="font-mono text-[11px] text-muted-foreground">{weeklyRecurring.length}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">Drag onto a day to schedule it</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {weeklyRecurring.map((t) => (
              <div key={t.id} className="w-40 max-w-full">
                <TaskChip t={t} />
              </div>
            ))}
          </div>

        </div>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        {scheduledCount} task{scheduledCount === 1 ? "" : "s"} placed this week · dropping a task on a day sets its due date.
      </p>
    </div>
  );
}
