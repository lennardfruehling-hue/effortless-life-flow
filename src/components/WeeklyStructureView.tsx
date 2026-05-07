import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { Task, WeeklyStructureBlock, DailyScheduleSlot } from "@/lib/types";
import { CategoryBadge } from "./CategoryBadge";
import { useAuth } from "@/hooks/useAuth";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { cloudGetAllByKey, CLOUD_KEYS } from "@/lib/cloudStore";
import { Upload, Link2, Trash2, Plus, Eye, EyeOff, CalendarDays, Repeat, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  blocks: WeeklyStructureBlock[];
  onSave: (b: WeeklyStructureBlock[]) => void;
  tasks: Task[];
  dailySchedule: DailyScheduleSlot[];
  onSaveDailySchedule: (s: DailyScheduleSlot[]) => void;
}

const SLOT_PX = 14; // height per 15-min slot
const SNAP_MIN = 15;
const SLOTS_PER_DAY = 96; // 24*4
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
const snap = (m: number) => Math.round(m / SNAP_MIN) * SNAP_MIN;

function parseICS(text: string): { title: string; dayOfWeek: number; startTime: string; endTime: string }[] {
  const out: { title: string; dayOfWeek: number; startTime: string; endTime: string }[] = [];
  const blocks = text.split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const get = (key: string) => {
      const m = block.match(new RegExp(`${key}[^:]*:(.+)`, "m"));
      return m ? m[1].trim() : "";
    };
    const summary = get("SUMMARY");
    const dtstart = get("DTSTART");
    const dtend = get("DTEND");
    if (!summary || !dtstart || dtstart.length < 13) continue;
    const y = +dtstart.slice(0, 4);
    const mo = +dtstart.slice(4, 6) - 1;
    const d = +dtstart.slice(6, 8);
    const sh = +dtstart.slice(9, 11);
    const sm = +dtstart.slice(11, 13);
    const dow = new Date(y, mo, d).getDay();
    let eh = sh + 1, em = sm;
    if (dtend && dtend.length >= 13) {
      eh = +dtend.slice(9, 11);
      em = +dtend.slice(11, 13);
    }
    out.push({
      title: summary.replace(/\\,/g, ",").replace(/\\n/g, " "),
      dayOfWeek: dow,
      startTime: `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`,
      endTime: `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`,
    });
  }
  return out;
}

export default function WeeklyStructureView({ blocks, onSave, tasks, dailySchedule, onSaveDailySchedule }: Props) {
  const { user } = useAuth();
  const { members } = useHouseholdMembers();
  const fileRef = useRef<HTMLInputElement>(null);
  const [icsUrl, setIcsUrl] = useState("");
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; offsetMin: number; origStart: number; origEnd: number; origDay: number } | null>(null);
  const [viewingMember, setViewingMember] = useState<string | null>(null); // null = own
  const [memberStructures, setMemberStructures] = useState<Record<string, WeeklyStructureBlock[]>>({});
  const gridRef = useRef<HTMLDivElement>(null);

  // Live now indicator
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const nowDay = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Load household members' structures (read-only).
  useEffect(() => {
    cloudGetAllByKey<WeeklyStructureBlock[]>(CLOUD_KEYS.weeklyStructure).then((rows) => {
      const map: Record<string, WeeklyStructureBlock[]> = {};
      for (const r of rows) map[r.user_id] = r.value || [];
      setMemberStructures(map);
    });
  }, [members.length]);

  const visibleBlocks: WeeklyStructureBlock[] = useMemo(() => {
    if (!viewingMember || viewingMember === user?.id) return blocks;
    return memberStructures[viewingMember] || [];
  }, [viewingMember, blocks, memberStructures, user?.id]);

  const isReadOnly = !!viewingMember && viewingMember !== user?.id;

  // ----- Drop a task from palette onto the grid -----
  const handleDrop = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/task-id");
    if (!taskId || !gridRef.current) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const colW = rect.width / 7;
    const day = Math.max(0, Math.min(6, Math.floor(x / colW)));
    const startMin = snap(Math.max(0, Math.min(1440 - 30, (y / SLOT_PX) * SNAP_MIN)));
    const dur = task.duration && task.duration >= 15 ? task.duration : 60;
    const block: WeeklyStructureBlock = {
      id: uuid(),
      dayOfWeek: day,
      startTime: toHHMM(startMin),
      endTime: toHHMM(Math.min(1440, startMin + dur)),
      taskId: task.id,
      taskCategories: task.categories,
      source: task.recurrence === "weekly" ? "recurring" : "task",
      recurring: true,
    };
    onSave([...blocks, block]);
  };

  const handleGridClick = (e: React.MouseEvent) => {
    if (isReadOnly || drag) return;
    if ((e.target as HTMLElement).dataset.bg !== "1") return;
    const rect = gridRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const colW = rect.width / 7;
    const day = Math.max(0, Math.min(6, Math.floor(x / colW)));
    const startMin = snap((y / SLOT_PX) * SNAP_MIN);
    const title = prompt("Block title (e.g. MMA, Work shift):");
    if (!title) return;
    onSave([
      ...blocks,
      {
        id: uuid(),
        dayOfWeek: day,
        startTime: toHHMM(startMin),
        endTime: toHHMM(startMin + 60),
        label: title,
        source: "manual",
        recurring: true,
      },
    ]);
  };

  // ----- Block move / resize -----
  const onBlockMouseDown = (e: React.MouseEvent, b: WeeklyStructureBlock, mode: "move" | "resize") => {
    if (isReadOnly) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = gridRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const cursorMin = (y / SLOT_PX) * SNAP_MIN;
    setDrag({
      id: b.id,
      mode,
      offsetMin: cursorMin - toMin(b.startTime),
      origStart: toMin(b.startTime),
      origEnd: toMin(b.endTime),
      origDay: b.dayOfWeek,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (ev: MouseEvent) => {
      const rect = gridRef.current!.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const colW = rect.width / 7;
      const cursorMin = (y / SLOT_PX) * SNAP_MIN;
      onSave(
        blocks.map((b) => {
          if (b.id !== drag.id) return b;
          if (drag.mode === "move") {
            const dur = drag.origEnd - drag.origStart;
            const newStart = Math.max(0, Math.min(1440 - dur, snap(cursorMin - drag.offsetMin)));
            const newDay = Math.max(0, Math.min(6, Math.floor(x / colW)));
            return { ...b, dayOfWeek: newDay, startTime: toHHMM(newStart), endTime: toHHMM(newStart + dur) };
          } else {
            const newEnd = Math.max(drag.origStart + SNAP_MIN, Math.min(1440, snap(cursorMin)));
            return { ...b, endTime: toHHMM(newEnd) };
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
  }, [drag, blocks, onSave]);

  // ----- ICS import (file) -----
  const handleICSFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseICS(text);
      if (parsed.length === 0) {
        toast.error("No events found in ICS file");
        return;
      }
      const newBlocks: WeeklyStructureBlock[] = parsed.map((p) => ({
        id: uuid(),
        dayOfWeek: p.dayOfWeek,
        startTime: p.startTime,
        endTime: p.endTime,
        label: p.title,
        source: "ics",
        recurring: true,
      }));
      onSave([...blocks, ...newBlocks]);
      toast.success(`Imported ${newBlocks.length} blocks from ICS`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ----- ICS import (URL subscription) -----
  const handleICSUrl = async () => {
    const url = icsUrl.trim();
    if (!url) return;
    try {
      const resp = await fetch(url.replace(/^webcal:\/\//, "https://"));
      const text = await resp.text();
      const parsed = parseICS(text);
      if (parsed.length === 0) {
        toast.error("No events found at URL");
        return;
      }
      // Replace existing blocks from this URL
      const kept = blocks.filter((b) => b.icsUrl !== url);
      const newBlocks: WeeklyStructureBlock[] = parsed.map((p) => ({
        id: uuid(),
        dayOfWeek: p.dayOfWeek,
        startTime: p.startTime,
        endTime: p.endTime,
        label: p.title,
        source: "ics",
        icsUrl: url,
        recurring: true,
      }));
      onSave([...kept, ...newBlocks]);
      toast.success(`Subscribed: ${newBlocks.length} events from URL`);
      setIcsUrl("");
    } catch (e: any) {
      toast.error(`Failed: ${e?.message || "fetch error (CORS?)"}`);
    }
  };

  const removeBlock = (id: string) => onSave(blocks.filter((b) => b.id !== id));

  // ----- Apply today's structure into the daily schedule -----
  const applyTodayToSchedule = () => {
    const today = new Date().getDay();
    const todayBlocks = visibleBlocks.filter((b) => b.dayOfWeek === today);
    if (todayBlocks.length === 0) {
      toast.info("No structure blocks for today");
      return;
    }
    const existingTaskIds = new Set(dailySchedule.map((s) => s.taskId).filter(Boolean));
    const additions: DailyScheduleSlot[] = todayBlocks
      .filter((b) => !b.taskId || !existingTaskIds.has(b.taskId))
      .map((b) => ({
        id: uuid(),
        startTime: b.startTime,
        endTime: b.endTime,
        taskId: b.taskId,
        label: b.taskId ? undefined : b.label,
        taskCategories: b.taskCategories,
      }));
    if (additions.length === 0) {
      toast.info("Today's structure is already in your schedule");
      return;
    }
    onSaveDailySchedule(
      [...dailySchedule, ...additions].sort((a, b) => a.startTime.localeCompare(b.startTime))
    );
    toast.success(`Added ${additions.length} blocks to today`);
  };

  const unscheduledTasks = useMemo(() => {
    const scheduled = new Set(blocks.map((b) => b.taskId).filter(Boolean));
    return tasks.filter((t) => !t.completed && !scheduled.has(t.id));
  }, [tasks, blocks]);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      {/* Header / toolbar */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarDays size={14} className="text-primary" />
            Weekly Structure {isReadOnly && <span className="text-[10px] text-muted-foreground">(read-only)</span>}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Build a recurring 7-day template. Drag tasks, paint blocks, import work schedules.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isReadOnly && (
            <>
              <button
                onClick={applyTodayToSchedule}
                className="text-[11px] px-2.5 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                title="Copy today's blocks into your daily schedule"
              >
                <Repeat size={11} className="inline mr-1" /> Apply today
              </button>
              <input ref={fileRef} type="file" accept=".ics,.ical" onChange={handleICSFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="text-[11px] px-2.5 py-1.5 rounded border border-border hover:border-primary/30 hover:text-primary text-muted-foreground transition-colors"
                title="Import .ics work schedule"
              >
                <Upload size={11} className="inline mr-1" /> ICS file
              </button>
            </>
          )}
          {members.length > 1 && (
            <select
              value={viewingMember ?? ""}
              onChange={(e) => setViewingMember(e.target.value || null)}
              className="text-[11px] bg-secondary border border-border rounded px-2 py-1.5 text-foreground"
              title="View another household member's structure"
            >
              <option value="">My structure</option>
              {members
                .filter((m) => m.user_id !== user?.id)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    👁 {m.display_name || "Member"}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      {/* ICS URL subscription */}
      {!isReadOnly && (
        <div className="flex items-center gap-2 mb-3">
          <Link2 size={12} className="text-muted-foreground shrink-0" />
          <input
            value={icsUrl}
            onChange={(e) => setIcsUrl(e.target.value)}
            placeholder="webcal:// or https://…/calendar.ics"
            className="flex-1 bg-secondary border border-border rounded px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleICSUrl}
            disabled={!icsUrl.trim()}
            className="text-[11px] px-2.5 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-30"
          >
            Subscribe
          </button>
        </div>
      )}

      <div className="grid grid-cols-[140px_60px_1fr] gap-3">
        {/* Task palette */}
        <div className="border-r border-border pr-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">
            {isReadOnly ? "Read-only view" : "Drag tasks →"}
          </p>
          {!isReadOnly && (
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto scrollbar-thin">
              {unscheduledTasks.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">No unscheduled tasks</p>
              )}
              {unscheduledTasks.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                  className="cursor-grab active:cursor-grabbing p-1.5 rounded border border-border bg-secondary/40 hover:border-primary/40 text-[11px]"
                >
                  <div className="text-foreground line-clamp-2 mb-0.5">{t.title}</div>
                  <div className="flex flex-wrap gap-0.5">
                    {t.categories.slice(0, 3).map((c) => (
                      <CategoryBadge key={c} category={c} small />
                    ))}
                  </div>
                  {t.recurrence === "weekly" && (
                    <div className="text-[9px] text-primary font-mono mt-0.5">
                      <Repeat size={8} className="inline" /> weekly
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hour gutter */}
        <div className="relative" style={{ height: SLOTS_PER_DAY * SLOT_PX }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="absolute left-0 right-0 text-[9px] text-muted-foreground font-mono pr-1 text-right"
              style={{ top: h * 4 * SLOT_PX, height: 4 * SLOT_PX }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* 7-day grid */}
        <div className="relative">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {DAYS.map((d, i) => (
              <div
                key={d}
                className={`text-[10px] font-mono text-center py-1 rounded ${
                  i === nowDay ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                {d}
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            data-bg="1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={handleGridClick}
            className="relative bg-secondary/20 rounded border border-border overflow-hidden"
            style={{ height: SLOTS_PER_DAY * SLOT_PX }}
          >
            {/* hour grid lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                data-bg="1"
                className="absolute left-0 right-0 border-t border-border/40"
                style={{ top: h * 4 * SLOT_PX, height: 4 * SLOT_PX }}
              />
            ))}
            {/* day separators */}
            {Array.from({ length: 7 }, (_, d) => (
              <div
                key={d}
                data-bg="1"
                className="absolute top-0 bottom-0 border-l border-border/40"
                style={{ left: `${(d / 7) * 100}%`, width: `${100 / 7}%` }}
              />
            ))}
            {/* now indicator on today's column */}
            <div
              className="absolute z-10 pointer-events-none"
              style={{
                left: `${(nowDay / 7) * 100}%`,
                width: `${100 / 7}%`,
                top: (nowMin / SNAP_MIN) * SLOT_PX,
              }}
            >
              <div className="h-px bg-destructive" />
              <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-destructive" />
            </div>

            {/* blocks */}
            {visibleBlocks.map((b) => {
              const start = toMin(b.startTime);
              const end = toMin(b.endTime);
              const top = (start / SNAP_MIN) * SLOT_PX;
              const height = Math.max(SLOT_PX, ((end - start) / SNAP_MIN) * SLOT_PX);
              const left = `${(b.dayOfWeek / 7) * 100}%`;
              const width = `${100 / 7}%`;
              const task = b.taskId ? tasks.find((t) => t.id === b.taskId) : null;
              const title = task?.title || b.label || "(untitled)";
              const tone =
                b.source === "ics"
                  ? "bg-cat-j/30 border-cat-j/60"
                  : b.source === "recurring"
                    ? "bg-cat-g/30 border-cat-g/60"
                    : b.taskId
                      ? "bg-primary/25 border-primary/60"
                      : "bg-cat-c/25 border-cat-c/60";
              return (
                <div
                  key={b.id}
                  onMouseDown={(e) => onBlockMouseDown(e, b, "move")}
                  className={`absolute rounded border ${tone} px-1 py-0.5 overflow-hidden text-[10px] text-foreground ${
                    isReadOnly ? "cursor-default opacity-80" : "cursor-move hover:brightness-110"
                  }`}
                  style={{ top, height, left, width }}
                  title={`${title} · ${b.startTime}–${b.endTime}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="font-medium leading-tight line-clamp-2">{title}</div>
                    {!isReadOnly && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBlock(b.id);
                        }}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    {b.startTime}–{b.endTime}
                  </div>
                  {!isReadOnly && height > SLOT_PX * 2 && (
                    <div
                      onMouseDown={(e) => onBlockMouseDown(e, b, "resize")}
                      className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-foreground/10"
                    />
                  )}
                </div>
              );
            })}
          </div>
          {!isReadOnly && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Click empty cell to create a block · drag tasks from the left · drag blocks to move · bottom edge to resize.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
