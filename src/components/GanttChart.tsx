import { useRef, useState, useEffect } from "react";
import { AssigneeAvatar } from "./AssigneePicker";
import { useHouseholdMembers, MemberProfile } from "@/hooks/useHouseholdMembers";

export interface GanttTask {
  id: string;
  label: string;
  startDate?: string;
  endDate: string; // deadline
  done: boolean;
  assigneeId?: string | null;
}

interface Props {
  tasks: GanttTask[];
  rangeStart: Date;
  rangeEnd: Date;
  onChange: (id: string, patch: { startDate?: string; endDate?: string }) => void;
  onAssign?: (id: string, assigneeId: string | null) => void;
}

const DAY = 24 * 60 * 60 * 1000;

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function parseYMD(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export default function GanttChart({ tasks, rangeStart, rangeEnd, onChange, onAssign }: Props) {
  const { members, byId } = useHouseholdMembers();
  const totalDays = Math.max(1, (rangeEnd.getTime() - rangeStart.getTime()) / DAY);
  const containerRef = useRef<HTMLDivElement>(null);

  const [drag, setDrag] = useState<null | { id: string; mode: "move" | "left" | "right"; startX: number; origStart: Date; origEnd: Date }>(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - drag.startX;
      const daysDelta = Math.round((dx / rect.width) * totalDays);
      let s = new Date(drag.origStart.getTime());
      let en = new Date(drag.origEnd.getTime());
      if (drag.mode === "move") {
        s = new Date(drag.origStart.getTime() + daysDelta * DAY);
        en = new Date(drag.origEnd.getTime() + daysDelta * DAY);
      } else if (drag.mode === "left") {
        s = new Date(drag.origStart.getTime() + daysDelta * DAY);
        if (s >= en) s = new Date(en.getTime() - DAY);
      } else {
        en = new Date(drag.origEnd.getTime() + daysDelta * DAY);
        if (en <= s) en = new Date(s.getTime() + DAY);
      }
      onChange(drag.id, { startDate: ymd(s), endDate: ymd(en) });
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, totalDays, onChange]);

  const todayPct = ((Date.now() - rangeStart.getTime()) / DAY / totalDays) * 100;

  // Build month labels
  const months: { label: string; pct: number }[] = [];
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor <= rangeEnd) {
    months.push({
      label: cursor.toLocaleDateString("en", { month: "short", year: "2-digit" }),
      pct: ((cursor.getTime() - rangeStart.getTime()) / DAY / totalDays) * 100,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="space-y-1">
      {/* Month header */}
      <div ref={containerRef} className="relative h-5 border-b border-border/40 text-[9px] text-muted-foreground font-mono">
        {months.map((m, i) => (
          <span key={i} className="absolute top-0 -translate-x-1/2" style={{ left: `${Math.max(0, Math.min(100, m.pct))}%` }}>
            {m.label}
          </span>
        ))}
      </div>

      {/* Rows */}
      {tasks.map(t => {
        const end = parseYMD(t.endDate) || new Date();
        const start = parseYMD(t.startDate) || new Date(end.getTime() - 7 * DAY);
        const leftPct = ((start.getTime() - rangeStart.getTime()) / DAY / totalDays) * 100;
        const widthPct = ((end.getTime() - start.getTime()) / DAY / totalDays) * 100;
        const member = byId(t.assigneeId);
        const color = member?.color || "hsl(var(--primary))";
        return (
          <div key={t.id} className="grid grid-cols-[160px_24px_1fr] gap-2 items-center text-xs">
            <div className="truncate text-foreground" title={t.label}>{t.label}</div>
            <div className="flex justify-center">
              {onAssign && members.length >= 1 ? (
                <div className="relative">
                  <AssigneeAvatar member={member} />
                  <select
                    value={t.assigneeId || ""}
                    onChange={(e) => onAssign(t.id, e.target.value || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || "Member"}</option>)}
                  </select>
                </div>
              ) : <AssigneeAvatar member={member} />}
            </div>
            <div className="relative h-5 bg-secondary/40 rounded">
              {todayPct >= 0 && todayPct <= 100 && (
                <div className="absolute top-0 bottom-0 w-px bg-destructive/50 z-10" style={{ left: `${todayPct}%` }} />
              )}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDrag({ id: t.id, mode: "move", startX: e.clientX, origStart: start, origEnd: end });
                }}
                className={`absolute top-0.5 bottom-0.5 rounded shadow-sm cursor-grab active:cursor-grabbing flex items-center ${t.done ? "opacity-50" : ""}`}
                style={{
                  left: `${Math.max(0, leftPct)}%`,
                  width: `${Math.max(1, Math.min(100 - Math.max(0, leftPct), widthPct))}%`,
                  background: color,
                }}
                title={`${t.label} · ${ymd(start)} → ${ymd(end)}`}
              >
                <span
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDrag({ id: t.id, mode: "left", startX: e.clientX, origStart: start, origEnd: end }); }}
                  className="w-1.5 h-full bg-black/20 cursor-ew-resize rounded-l"
                />
                <span className="flex-1" />
                <span
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDrag({ id: t.id, mode: "right", startX: e.clientX, origStart: start, origEnd: end }); }}
                  className="w-1.5 h-full bg-black/20 cursor-ew-resize rounded-r"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
