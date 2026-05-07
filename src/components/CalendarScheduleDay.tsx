import { useEffect, useRef, useState, useMemo } from "react";
import { Task, DailyScheduleSlot, Category } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { Trash2, Mail, Plus, Printer } from "lucide-react";
import { v4 as uuid } from "uuid";
import { toast } from "sonner";

interface Props {
  slots: DailyScheduleSlot[];
  tasks: Task[];
  onSaveSlots: (slots: DailyScheduleSlot[]) => void;
}

const HOUR_PX = 56; // px per hour
const SNAP_MIN = 15;

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

export default function CalendarScheduleDay({ slots, tasks, onSaveSlots }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; offsetMin: number; origStart: number; origEnd: number } | null>(null);
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // ---- Behind-schedule alarms via Notification API ----
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);
  useEffect(() => {
    const overdue = slots.filter((s) => {
      if (s.alarmFired) return false;
      const end = toMin(s.endTime);
      if (nowMin < end) return false;
      if (!s.taskId) return false;
      const task = tasks.find((t) => t.id === s.taskId);
      return task && !task.completed;
    });
    if (overdue.length === 0) return;
    overdue.forEach((s) => {
      const task = tasks.find((t) => t.id === s.taskId);
      const title = task?.title || s.label || "Scheduled task";
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("⏰ Behind schedule", { body: `${title} (was due by ${s.endTime})`, tag: s.id });
        }
      } catch {}
      toast.warning(`Behind schedule: ${title}`, { description: `Was due by ${s.endTime}` });
    });
    onSaveSlots(slots.map((s) => (overdue.find((o) => o.id === s.id) ? { ...s, alarmFired: true } : s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMin, slots, tasks]);

  // ---- Drag & drop from task list ----
  const handleDropTask = (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/task-id");
    if (!taskId || !gridRef.current) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startMin = snap(Math.max(0, Math.min(1440 - 30, (y / HOUR_PX) * 60)));
    const dur = task.duration && task.duration >= 15 ? task.duration : 60;
    const slot: DailyScheduleSlot = {
      id: uuid(),
      startTime: toHHMM(startMin),
      endTime: toHHMM(Math.min(1440, startMin + dur)),
      taskId: task.id,
      taskCategories: task.categories,
    };
    onSaveSlots([...slots, slot].sort((a, b) => toMin(a.startTime) - toMin(b.startTime)));
    window.dispatchEvent(new CustomEvent("serpent-progress", { detail: "schedule-block-added" }));
  };

  // ---- Click empty area to create custom block ----
  const handleGridClick = (e: React.MouseEvent) => {
    if (drag) return;
    if (e.target !== gridRef.current && (e.target as HTMLElement).dataset.bg !== "1") return;
    const rect = gridRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startMin = snap((y / HOUR_PX) * 60);
    const title = prompt("Block title:");
    if (!title) return;
    const slot: DailyScheduleSlot = {
      id: uuid(),
      startTime: toHHMM(startMin),
      endTime: toHHMM(startMin + 60),
      label: title,
    };
    onSaveSlots([...slots, slot].sort((a, b) => toMin(a.startTime) - toMin(b.startTime)));
    window.dispatchEvent(new CustomEvent("serpent-progress", { detail: "schedule-block-added" }));
  };

  // ---- Block move/resize ----
  const onBlockMouseDown = (e: React.MouseEvent, slot: DailyScheduleSlot, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    const rect = gridRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const cursorMin = (y / HOUR_PX) * 60;
    const origStart = toMin(slot.startTime);
    const origEnd = toMin(slot.endTime);
    setDrag({ id: slot.id, mode, offsetMin: cursorMin - origStart, origStart, origEnd });
  };
  useEffect(() => {
    if (!drag) return;
    const move = (ev: MouseEvent) => {
      const rect = gridRef.current!.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const cursorMin = (y / HOUR_PX) * 60;
      onSaveSlots(
        slots.map((s) => {
          if (s.id !== drag.id) return s;
          if (drag.mode === "move") {
            const dur = drag.origEnd - drag.origStart;
            const newStart = Math.max(0, Math.min(1440 - dur, snap(cursorMin - drag.offsetMin)));
            return { ...s, startTime: toHHMM(newStart), endTime: toHHMM(newStart + dur), alarmFired: false };
          } else {
            const newEnd = Math.max(drag.origStart + SNAP_MIN, Math.min(1440, snap(cursorMin)));
            return { ...s, endTime: toHHMM(newEnd), alarmFired: false };
          }
        })
      );
    };
    const up = () => setDrag(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [drag, slots, onSaveSlots]);

  const removeSlot = (id: string) => onSaveSlots(slots.filter((s) => s.id !== id));

  const unscheduledTasks = useMemo(() => {
    const scheduledIds = new Set(slots.map((s) => s.taskId).filter(Boolean));
    return tasks.filter((t) => !t.completed && !scheduledIds.has(t.id));
  }, [tasks, slots]);

  // ---- Email today's schedule ----
  const handleEmailSchedule = () => {
    const sorted = [...slots].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    if (sorted.length === 0) {
      toast.error("No blocks to email");
      return;
    }
    const lines = sorted.map((s) => {
      const t = s.taskId ? tasks.find((x) => x.id === s.taskId) : null;
      const title = t?.title || s.label || "(untitled)";
      const cats = (s.taskCategories || t?.categories || []).join(", ");
      return `${s.startTime}–${s.endTime}  ${title}${cats ? ` [${cats}]` : ""}`;
    });
    const body = encodeURIComponent(`Today's Serpent Schedule\n\n${lines.join("\n")}\n`);
    const subject = encodeURIComponent(`Serpent — Schedule for ${new Date().toLocaleDateString()}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // ---- Print today's schedule (printable HTML view) ----
  const handlePrintSchedule = () => {
    const sorted = [...slots].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    if (sorted.length === 0) {
      toast.error("No blocks to print");
      return;
    }
    const dateStr = new Date().toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const rows = sorted.map((s) => {
      const t = s.taskId ? tasks.find((x) => x.id === s.taskId) : null;
      const title = t?.title || s.label || "(untitled)";
      const cats = (s.taskCategories || t?.categories || []).join(", ");
      const dur = toMin(s.endTime) - toMin(s.startTime);
      const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
      return `<tr>
        <td class="time">${s.startTime}–${s.endTime}</td>
        <td class="dur">${dur}m</td>
        <td class="title">${esc(title)}</td>
        <td class="cats">${esc(cats)}</td>
        <td class="check"><span class="box"></span></td>
      </tr>`;
    }).join("");
    const totalMin = sorted.reduce((sum, s) => sum + (toMin(s.endTime) - toMin(s.startTime)), 0);
    const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Serpent Schedule — ${dateStr}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #111; margin: 24px; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 16px; }
  h1 { font-size: 22px; margin: 0; letter-spacing: 0.5px; }
  .sub { font-size: 12px; color: #555; }
  .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; border-bottom: 1px solid #111; }
  td.time { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
  td.dur { font-variant-numeric: tabular-nums; color: #666; width: 50px; }
  td.cats { color: #666; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  td.check { width: 28px; text-align: center; }
  .box { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #111; border-radius: 3px; }
  footer { margin-top: 24px; font-size: 11px; color: #777; display: flex; justify-content: space-between; }
  .toolbar { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; }
  .toolbar button { padding: 8px 14px; font-size: 13px; border: 1px solid #111; background: #111; color: #fff; border-radius: 6px; cursor: pointer; }
  .toolbar button.secondary { background: #fff; color: #111; }
  @media print { .toolbar { display: none; } body { margin: 12mm; } }
</style></head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  <header>
    <h1>🐍 Serpent Schedule</h1>
    <div class="sub">${dateStr}</div>
  </header>
  <div class="meta">${sorted.length} blocks · ${Math.floor(totalMin / 60)}h ${totalMin % 60}m planned</div>
  <table>
    <thead><tr><th>Time</th><th>Dur</th><th>Task</th><th>Cat</th><th>Done</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <footer><span>Generated ${new Date().toLocaleString()}</span><span>Serpent List</span></footer>
  <script>setTimeout(() => { try { window.print(); } catch(e){} }, 300);</script>
</body></html>`;
    const win = window.open("", "_blank");
    if (!win) {
      // Fallback for popup blockers / mobile: navigate via blob
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.location.href = url;
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4" data-tour="schedule-panel">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground">Daily Calendar (24h)</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintSchedule}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-border hover:border-primary/30 hover:text-primary text-muted-foreground transition-colors"
            title="Open a printable view of today's schedule"
          >
            <Printer size={12} /> Print schedule
          </button>
          <button
            data-tour="email-schedule"
            onClick={handleEmailSchedule}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-border hover:border-primary/30 hover:text-primary text-muted-foreground transition-colors"
            title="Email today's schedule"
          >
            <Mail size={12} /> Email schedule
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[160px_1fr] gap-3">
        {/* Task palette */}
        <div className="border-r border-border pr-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">Drag tasks →</p>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto scrollbar-thin">
            {unscheduledTasks.length === 0 && <p className="text-[11px] text-muted-foreground italic">No unscheduled tasks</p>}
            {unscheduledTasks.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                className="cursor-grab active:cursor-grabbing p-2 rounded border border-border bg-secondary/40 hover:border-primary/40 hover:bg-secondary text-xs"
              >
                <div className="text-foreground line-clamp-2 mb-1">{t.title}</div>
                <div className="flex flex-wrap gap-0.5">
                  {t.categories.slice(0, 3).map((c) => (
                    <CategoryBadge key={c} category={c} small />
                  ))}
                </div>
                {t.duration && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{t.duration}m</div>}
              </div>
            ))}
          </div>
        </div>

        {/* 24h grid */}
        <div className="relative">
          <div
            ref={gridRef}
            data-bg="1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropTask}
            onClick={handleGridClick}
            className="relative bg-secondary/20 rounded border border-border overflow-hidden"
            style={{ height: 24 * HOUR_PX }}
          >
            {/* hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                data-bg="1"
                className="absolute left-0 right-0 border-t border-border/50 text-[10px] text-muted-foreground font-mono pl-1"
                style={{ top: h * HOUR_PX, height: HOUR_PX }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
            {/* now indicator */}
            <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: (nowMin / 60) * HOUR_PX }}>
              <div className="h-px bg-destructive" />
              <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-destructive" />
            </div>
            {/* blocks */}
            {slots.map((s) => {
              const start = toMin(s.startTime);
              const end = toMin(s.endTime);
              const top = (start / 60) * HOUR_PX;
              const height = Math.max(20, ((end - start) / 60) * HOUR_PX);
              const task = s.taskId ? tasks.find((t) => t.id === s.taskId) : null;
              const cats = s.taskCategories || task?.categories || [];
              const overdue = nowMin > end && task && !task.completed;
              return (
                <div
                  key={s.id}
                  onMouseDown={(e) => onBlockMouseDown(e, s, "move")}
                  className={`absolute left-12 right-2 rounded border bg-primary/15 border-primary/40 hover:border-primary px-2 py-1 cursor-move overflow-hidden group ${
                    overdue ? "ring-1 ring-destructive border-destructive/60" : ""
                  }`}
                  style={{ top, height }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="text-[11px] font-mono text-primary">{s.startTime}–{s.endTime}</div>
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); removeSlot(s.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div className="text-xs text-foreground truncate">
                    {task?.title || s.label || "(untitled)"}
                  </div>
                  {cats.length > 0 && height > 50 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {cats.slice(0, 4).map((c) => <CategoryBadge key={c} category={c} small />)}
                    </div>
                  )}
                  {/* resize handle */}
                  <div
                    onMouseDown={(e) => onBlockMouseDown(e, s, "resize")}
                    className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-primary/40"
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <Plus size={10} /> Click empty space to add a custom block · drag to move · drag bottom edge to resize
          </p>
        </div>
      </div>
    </div>
  );
}
