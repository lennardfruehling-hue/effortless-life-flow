import { useState } from "react";
import { Task, DailyScheduleSlot } from "@/lib/types";
import { Plus, Trash2, Clock, GripVertical } from "lucide-react";
import { v4 as uuid } from "uuid";

interface DailyScheduleProps {
  slots: DailyScheduleSlot[];
  tasks: Task[];
  onSaveSlots: (slots: DailyScheduleSlot[]) => void;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function DailySchedule({ slots, tasks, onSaveSlots }: DailyScheduleProps) {
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("10:00");

  const activeTasks = tasks.filter(t => !t.completed);

  const addSlot = () => {
    if (!newStart || !newEnd) return;
    const slot: DailyScheduleSlot = { id: uuid(), startTime: newStart, endTime: newEnd };
    const updated = [...slots, slot].sort((a, b) => a.startTime.localeCompare(b.startTime));
    onSaveSlots(updated);
  };

  const removeSlot = (id: string) => {
    onSaveSlots(slots.filter(s => s.id !== id));
  };

  const assignTask = (slotId: string, taskId: string) => {
    onSaveSlots(slots.map(s => s.id === slotId ? { ...s, taskId: taskId || undefined } : s));
  };

  const updateLabel = (slotId: string, label: string) => {
    onSaveSlots(slots.map(s => s.id === slotId ? { ...s, label: label || undefined } : s));
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock size={16} className="text-primary" /> Daily Schedule
        </h3>
      </div>

      {/* Add slot */}
      <div className="flex items-center gap-2 mb-4">
        <input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} className="bg-secondary border border-border rounded px-2 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
        <span className="text-xs text-muted-foreground">to</span>
        <input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="bg-secondary border border-border rounded px-2 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
        <button onClick={addSlot} className="bg-primary text-primary-foreground px-2.5 py-1.5 rounded text-xs hover:opacity-90 transition-opacity">
          <Plus size={14} />
        </button>
      </div>

      {/* Slots */}
      <div className="space-y-1.5">
        {slots.map(slot => {
          const assignedTask = slot.taskId ? tasks.find(t => t.id === slot.taskId) : null;
          return (
            <div key={slot.id} className="flex items-center gap-2 p-2 bg-secondary/50 rounded border border-border/50 group">
              <GripVertical size={12} className="text-muted-foreground/30" />
              <span className="text-xs font-mono text-primary whitespace-nowrap">
                {slot.startTime}–{slot.endTime}
              </span>
              <div className="flex-1 min-w-0">
                {assignedTask ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-foreground truncate">{assignedTask.title}</span>
                    {assignedTask.duration && (
                      <span className="text-[10px] text-muted-foreground font-mono">({formatDuration(assignedTask.duration)})</span>
                    )}
                  </div>
                ) : (
                  <select
                    value={slot.taskId || ""}
                    onChange={e => assignTask(slot.id, e.target.value)}
                    className="w-full bg-transparent text-xs text-muted-foreground focus:outline-none"
                  >
                    <option value="">Assign a task...</option>
                    {activeTasks.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title}{t.duration ? ` (${formatDuration(t.duration)})` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {!assignedTask && !slot.taskId && (
                  <input
                    value={slot.label || ""}
                    onChange={e => updateLabel(slot.id, e.target.value)}
                    placeholder="Or type a label..."
                    className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none mt-0.5"
                  />
                )}
              </div>
              <button onClick={() => assignTask(slot.id, "")} className={`text-muted-foreground hover:text-foreground text-xs ${assignedTask ? "" : "hidden"}`}>
                ×
              </button>
              <button onClick={() => removeSlot(slot.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {slots.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">Add time slots and assign tasks to build your daily schedule</p>
      )}
    </div>
  );
}
