import { useEffect, useMemo, useRef, useState } from "react";
import { Task, WeeklyStructureBlock } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { ChevronLeft, ChevronRight, CalendarRange, Inbox, Repeat, Check, Trash2, Plus, X } from "lucide-react";
import { setDragTaskId, touchDragProps, TOUCH_DROP_EVENT, TouchDropDetail } from "@/lib/dragTask";

interface Props {
  tasks: Task[];
  onSave: (tasks: Task[]) => void;
  structure?: WeeklyStructureBlock[];
  /** When provided, structure blocks become editable/movable straight from this view. */
  onSaveStructure?: (blocks: WeeklyStructureBlock[]) => void;
  onEditTask?: (task: Task) => void;
  /** Rendered inside the tasks page (tighter spacing) vs. the full calendar page. */
  compact?: boolean;
}


const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_START = 8 * 60; // 08:00
const DAY_END = 22 * 60; // 22:00
const SNAP = 15;

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
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

type DragState = {
  kind: "task" | "block";
  id: string;
  startMin: number;
  durMin: number;
  originDay: string;
  pointerY: number;
  deltaMin: number;
  overDay: string;
  moved: boolean;
};

export default function WeeklyView({ tasks, onSave, structure = [], onSaveStructure, onEditTask, compact = false }: Props) {
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
  const [editBlockId, setEditBlockId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const PX_PER_MIN = compact ? 0.6 : 0.75;
  const gridHeight = (DAY_END - DAY_START) * PX_PER_MIN;

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
  /** First 15-min-aligned slot on `date` that fits `duration` without clashing. */
  const findFreeSlot = (date: string, duration: number, ignoreTaskId: string) => {
    const busy: Array<[number, number]> = [];
    for (const t of tasks) {
      if (t.id === ignoreTaskId || t.completed) continue;
      if (!t.dueTime || t.dueDate?.slice(0, 10) !== date) continue;
      const s = toMin(t.dueTime);
      busy.push([s, s + (t.duration || 30)]);
    }
    const idx = dayKeys.indexOf(date);
    if (idx >= 0) {
      for (const b of structureByDay[idx]) busy.push([toMin(b.startTime), toMin(b.endTime)]);
    }
    busy.sort((a, b) => a[0] - b[0]);

    const nowFloor = (() => {
      const n = new Date();
      if (date !== todayStr) return DAY_START;
      const m = Math.ceil((n.getHours() * 60 + n.getMinutes() + 5) / SNAP) * SNAP;
      return Math.max(DAY_START, m);
    })();

    for (let start = nowFloor; start + duration <= DAY_END; start += SNAP) {
      const end = start + duration;
      if (!busy.some(([bs, be]) => start < be && end > bs)) return toHHMM(start);
    }
    return toHHMM(Math.min(nowFloor, DAY_END - duration));
  };

  const scheduleTask = (taskId: string, date: string | null, explicitTime?: string) => {
    onSave(
      tasks.map((t) => {
        if (t.id !== taskId) return t;
        const duration = t.duration || 30;
        return {
          ...t,
          dueDate: date ?? undefined,
          // Dropping onto a day makes the task time-bound: it gets a concrete slot.
          dueTime: date ? explicitTime ?? findFreeSlot(date, duration, t.id) : undefined,
          duration: date ? duration : t.duration,
          // Keeping a dated task tagged "this week" keeps it visible in weekly planning.
          categories:
            date && date >= weekStart && date <= weekEnd && !t.categories.includes("A2") && !t.categories.includes("A1")
              ? [...t.categories, "A2" as const]
              : t.categories,
        };
      })
    );
  };

  const setTaskTime = (taskId: string, time: string) => {
    onSave(tasks.map((t) => (t.id === taskId ? { ...t, dueTime: time || undefined } : t)));
  };

  // --- Structure blocks ----------------------------------------------------
  const canEditStructure = Boolean(onSaveStructure);

  const updateBlock = (id: string, patch: Partial<WeeklyStructureBlock>) => {
    onSaveStructure?.(structure.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const deleteBlock = (id: string) => {
    onSaveStructure?.(structure.filter((b) => b.id !== id));
    setEditBlockId(null);
  };
  const addBlock = (date: string) => {
    if (!onSaveStructure) return;
    const dow = new Date(`${date}T00:00:00`).getDay();
    const block: WeeklyStructureBlock = {
      id: crypto.randomUUID(),
      dayOfWeek: dow,
      startTime: "09:00",
      endTime: "10:00",
      label: "New block",
      source: "manual",
      recurring: true,
    };
    onSaveStructure([...structure, block]);
    setEditBlockId(block.id);
  };
  /** Moving a block here wins over whatever the calendar view had for it. */
  const moveBlock = (id: string, date: string, startMin?: number) => {
    const block = structure.find((b) => b.id === id);
    if (!block || !onSaveStructure) return;
    const dow = new Date(`${date}T00:00:00`).getDay();
    const dur = Math.max(15, toMin(block.endTime) - toMin(block.startTime));
    updateBlock(id, {
      dayOfWeek: dow,
      ...(startMin !== undefined ? { startTime: toHHMM(startMin), endTime: toHHMM(startMin + dur) } : {}),
      ...(block.recurring === false ? { pinnedDate: date } : {}),
    });
  };

  // --- Pointer dragging inside the time grid --------------------------------
  const clampStart = (min: number, dur: number) =>
    Math.max(DAY_START, Math.min(DAY_END - dur, Math.round(min / SNAP) * SNAP));

  const dayFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zone = el?.closest("[data-week-drop]") as HTMLElement | null;
    const value = zone?.dataset.weekDrop;
    return value && value !== "unscheduled" ? value : null;
  };

  const beginPointerDrag = (
    e: React.PointerEvent,
    kind: "task" | "block",
    id: string,
    startMin: number,
    durMin: number,
    originDay: string
  ) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    setDrag({ kind, id, startMin, durMin, originDay, pointerY: e.clientY, deltaMin: 0, overDay: originDay, moved: false });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const rawDelta = (e.clientY - cur.pointerY) / PX_PER_MIN;
      const deltaMin = Math.round(rawDelta / SNAP) * SNAP;
      const overDay = dayFromPoint(e.clientX, e.clientY) ?? cur.overDay;
      const moved = cur.moved || Math.abs(e.clientY - cur.pointerY) > 4 || overDay !== cur.originDay;
      if (deltaMin !== cur.deltaMin || overDay !== cur.overDay || moved !== cur.moved) {
        setDrag({ ...cur, deltaMin, overDay, moved });
      }
      e.preventDefault();
    };
    const onUp = () => {
      const cur = dragRef.current;
      setDrag(null);
      if (!cur) return;
      if (!cur.moved) {
        if (cur.kind === "block" && canEditStructure) setEditBlockId((v) => (v === cur.id ? null : cur.id));
        return;
      }
      const newStart = clampStart(cur.startMin + cur.deltaMin, cur.durMin);
      if (cur.kind === "task") {
        if (cur.overDay !== cur.originDay) scheduleTask(cur.id, cur.overDay, toHHMM(newStart));
        else setTaskTime(cur.id, toHHMM(newStart));
      } else if (canEditStructure) {
        moveBlock(cur.id, cur.overDay, newStart);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, tasks, structure]);

  // Touch fallback for the trays: figure out which drop zone the finger was released over.
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

  /** Time under the cursor when dropping into a day's grid, if the pointer is over it. */
  const timeFromDropEvent = (e: React.DragEvent, dur: number) => {
    const grid = (e.currentTarget as HTMLElement).querySelector("[data-week-grid]") as HTMLElement | null;
    if (!grid) return undefined;
    const rect = grid.getBoundingClientRect();
    if (e.clientY < rect.top || e.clientY > rect.bottom) return undefined;
    const min = DAY_START + (e.clientY - rect.top) / PX_PER_MIN;
    return toHHMM(clampStart(min, dur));
  };

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
      const blockId = e.dataTransfer.getData("text/serpent-block");
      if (blockId) {
        if (value !== "unscheduled") {
          const b = structure.find((x) => x.id === blockId);
          const dur = b ? Math.max(15, toMin(b.endTime) - toMin(b.startTime)) : 60;
          const t = timeFromDropEvent(e, dur);
          moveBlock(blockId, value, t ? toMin(t) : undefined);
        }
        return;
      }
      const id = e.dataTransfer.getData("text/serpent-task") || e.dataTransfer.getData("text/plain");
      if (id) {
        if (value === "unscheduled") scheduleTask(id, null);
        else {
          const task = tasks.find((t) => t.id === id);
          scheduleTask(id, value, timeFromDropEvent(e, task?.duration || 30));
        }
      }
      setDragTaskId(null);
    },
  });

  const toggleComplete = (id: string) => {
    onSave(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  /** Small chip used in the trays and for undated tasks of a day. */
  const TaskChip = ({ t }: { t: Task }) => (
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
      title="Drag onto a day (and a time) to schedule it"
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
        {t.recurrence === "weekly" && (
          <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-primary"><Repeat size={9} /> wk</span>
        )}
        {t.categories.slice(0, 2).map((c) => (
          <CategoryBadge key={c} category={c} />
        ))}
      </div>
    </div>
  );

  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i);

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
          <span className="ml-auto text-[11px] text-muted-foreground">Drag onto a day and a time slot</span>
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
      <div className="flex gap-1 overflow-x-auto">
        {/* Hour gutter */}
        <div className="hidden shrink-0 sm:block" style={{ width: 34 }}>
          <div className="mb-1.5 h-[18px]" />
          <div className="relative" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <span
                key={h}
                className="absolute right-1 -translate-y-1/2 font-mono text-[9px] text-muted-foreground/70"
                style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}
              >
                {pad(h)}:00
              </span>
            ))}
          </div>
        </div>

        <div className="grid min-w-[640px] flex-1 grid-cols-7 gap-1">
          {days.map((d, i) => {
            const key = dayKeys[i];
            const isToday = key === todayStr;
            const dayTasks = byDay[key];
            const timed = dayTasks.filter((t) => t.dueTime);
            const undated = dayTasks.filter((t) => !t.dueTime);
            const blocks = structureByDay[i];
            const isDragOver = drag?.moved && drag.overDay === key;
            return (
              <div
                key={key}
                {...dropProps(key)}
                className={`flex flex-col rounded-md border p-1 transition-colors ${
                  dropTarget === key || isDragOver
                    ? "border-primary bg-primary/5"
                    : isToday
                    ? "border-primary/40 bg-primary/[0.04]"
                    : "border-border bg-background"
                }`}
              >
                <div className="mb-1.5 flex h-[18px] items-baseline gap-1">
                  <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                    {DAY_LABELS[i]}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{d.getDate()}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {dayTasks.length > 0 && (
                      <span className="font-mono text-[10px] text-muted-foreground">{dayTasks.length}</span>
                    )}
                    {canEditStructure && (
                      <button
                        onClick={() => addBlock(key)}
                        title="Add a structure block to this day"
                        className="text-muted-foreground transition-colors hover:text-primary"
                      >
                        <Plus size={11} />
                      </button>
                    )}
                  </span>
                </div>

                {/* Time grid */}
                <div data-week-grid className="relative select-none" style={{ height: gridHeight }}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-border/50"
                      style={{ top: (h * 60 - DAY_START) * PX_PER_MIN }}
                    />
                  ))}

                  {/* Structure blocks */}
                  {blocks.map((b) => {
                    const dur = Math.max(15, toMin(b.endTime) - toMin(b.startTime));
                    const dragging = drag?.kind === "block" && drag.id === b.id;
                    const start = dragging ? clampStart(drag!.startMin + drag!.deltaMin, dur) : toMin(b.startTime);
                    const hide = dragging && drag!.overDay !== key && drag!.moved;
                    if (hide) return null;
                    if (dragging && drag!.overDay !== drag!.originDay && drag!.overDay !== key) return null;
                    return (
                      <div key={`${b.id}-${key}`}>
                        <div
                          onPointerDown={(e) =>
                            canEditStructure && beginPointerDrag(e, "block", b.id, toMin(b.startTime), dur, key)
                          }
                          className={`absolute left-0 right-0 overflow-hidden rounded-sm border border-border/60 bg-secondary px-1 py-0.5 text-[10px] text-muted-foreground ${
                            canEditStructure ? "cursor-grab touch-none active:cursor-grabbing hover:bg-secondary/80" : ""
                          } ${dragging && drag!.moved ? "z-20 opacity-80 ring-1 ring-primary" : ""}`}
                          style={{ top: (start - DAY_START) * PX_PER_MIN, height: Math.max(14, dur * PX_PER_MIN - 2) }}
                          title={
                            canEditStructure
                              ? `${toHHMM(start)}–${toHHMM(start + dur)} ${b.label ?? ""} · drag to move in time or to another day, click to edit`
                              : `${b.startTime}–${b.endTime} ${b.label ?? ""}`
                          }
                        >
                          <span className="font-mono">{toHHMM(start)}</span>{" "}
                          {b.label || tasks.find((t) => t.id === b.taskId)?.title || "Structure"}
                        </div>

                        {canEditStructure && editBlockId === b.id && (
                          <div
                            className="absolute left-0 z-30 w-[150px] space-y-1 rounded-md border border-border bg-card p-1.5 shadow-md"
                            style={{ top: (start - DAY_START) * PX_PER_MIN + 18 }}
                          >
                            <div className="flex items-center gap-1">
                              <input
                                value={b.label ?? ""}
                                onChange={(e) => updateBlock(b.id, { label: e.target.value })}
                                placeholder="Label"
                                className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[10px] text-foreground"
                              />
                              <button
                                onClick={() => setEditBlockId(null)}
                                aria-label="Close block editor"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X size={11} />
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                type="time"
                                value={b.startTime}
                                step={900}
                                onChange={(e) => updateBlock(b.id, { startTime: e.target.value })}
                                className="min-w-0 flex-1 rounded border border-border bg-background px-0.5 font-mono text-[10px] text-foreground"
                              />
                              <input
                                type="time"
                                value={b.endTime}
                                step={900}
                                onChange={(e) => updateBlock(b.id, { endTime: e.target.value })}
                                className="min-w-0 flex-1 rounded border border-border bg-background px-0.5 font-mono text-[10px] text-foreground"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={b.recurring !== false}
                                  onChange={(e) =>
                                    updateBlock(b.id, {
                                      recurring: e.target.checked,
                                      pinnedDate: e.target.checked ? undefined : key,
                                    })
                                  }
                                  className="h-3 w-3"
                                />
                                Every week
                              </label>
                              <button
                                onClick={() => deleteBlock(b.id)}
                                className="flex items-center gap-0.5 text-[10px] text-destructive hover:opacity-80"
                              >
                                <Trash2 size={10} /> Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Timed tasks — moving these changes their time/date only, never the structure */}
                  {timed.map((t) => {
                    const dur = t.duration || 30;
                    const dragging = drag?.kind === "task" && drag.id === t.id;
                    if (dragging && drag!.moved && drag!.overDay !== key) return null;
                    const start = dragging ? clampStart(drag!.startMin + drag!.deltaMin, dur) : toMin(t.dueTime!);
                    return (
                      <div
                        key={t.id}
                        onPointerDown={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("button, input")) return;
                          beginPointerDrag(e, "task", t.id, toMin(t.dueTime!), dur, key);
                        }}
                        onDoubleClick={() => onEditTask?.(t)}
                        className={`absolute left-[3px] right-0 cursor-grab touch-none overflow-hidden rounded-md border px-1 py-0.5 text-[10px] leading-tight active:cursor-grabbing ${
                          t.completed
                            ? "border-border bg-muted/60 text-muted-foreground line-through"
                            : "border-primary/40 bg-primary/10 text-foreground"
                        } ${dragging && drag!.moved ? "z-20 opacity-80 ring-1 ring-primary" : "z-10"}`}
                        style={{ top: (start - DAY_START) * PX_PER_MIN, height: Math.max(16, dur * PX_PER_MIN - 2) }}
                        title={`${toHHMM(start)} · ${dur} min · drag to move in time or to another day, double-click to edit`}
                      >
                        <div className="flex items-start gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleComplete(t.id); }}
                            aria-label={t.completed ? "Mark as not done" : "Mark as done"}
                            className={`mt-[1px] flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                              t.completed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary"
                            }`}
                          >
                            {t.completed && <Check size={8} />}
                          </button>
                          <span className="font-mono text-[9px] text-muted-foreground">{toHHMM(start)}</span>
                        </div>
                        <span className="line-clamp-2 block">{t.title}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Dated but not yet time-bound */}
                {undated.length > 0 && (
                  <div className="mt-1 space-y-1 border-t border-dashed border-border pt-1">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground/70">No time</p>
                    {undated.map((t) => (
                      <TaskChip key={t.id} t={t} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
        {scheduledCount} task{scheduledCount === 1 ? "" : "s"} placed this week · drag a task to move its time or day ·
        dragging a structure block edits the weekly structure.
      </p>
    </div>
  );
}
