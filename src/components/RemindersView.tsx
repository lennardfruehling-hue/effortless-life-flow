import { useState, useMemo } from "react";
import { Reminder, Task } from "@/lib/types";
import { Plus, Trash2, Bell, BellOff } from "lucide-react";
import { v4 as uuid } from "uuid";
import { format, isPast, isToday } from "date-fns";

interface RemindersViewProps {
  reminders: Reminder[];
  tasks: Task[];
  onSave: (r: Reminder[]) => void;
}

export default function RemindersView({ reminders, tasks, onSave }: RemindersViewProps) {
  const [title, setTitle] = useState("");
  const [datetime, setDatetime] = useState("");
  const [recurring, setRecurring] = useState<"" | "daily" | "weekly" | "monthly">("");
  const [taskId, setTaskId] = useState("");

  const addReminder = () => {
    if (!title.trim() || !datetime) return;
    onSave([
      ...reminders,
      {
        id: uuid(),
        title: title.trim(),
        datetime,
        recurring: recurring || undefined,
        taskId: taskId || undefined,
        completed: false,
      },
    ]);
    setTitle("");
    setDatetime("");
    setRecurring("");
    setTaskId("");
  };

  const toggleReminder = (id: string) => {
    onSave(reminders.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r)));
  };

  const deleteReminder = (id: string) => {
    onSave(reminders.filter((r) => r.id !== id));
  };

  const sorted = useMemo(
    () =>
      [...reminders].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
      }),
    [reminders]
  );

  const activeTasks = tasks.filter((t) => !t.completed);

  return (
    <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
      <h2 className="text-2xl font-bold text-foreground mb-1">Reminders</h2>
      <p className="text-sm text-muted-foreground mb-6">Never forget what matters</p>

      {/* Add form */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6 space-y-3">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reminder title"
            className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="datetime-local"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
            className="bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={recurring}
            onChange={(e) => setRecurring(e.target.value as typeof recurring)}
            className="bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">One-time</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          {activeTasks.length > 0 && (
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Link to task (optional)</option>
              {activeTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          )}
          <button
            onClick={addReminder}
            disabled={!title.trim() || !datetime}
            className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Reminders list */}
      <div className="space-y-2">
        {sorted.map((rem) => {
          const date = new Date(rem.datetime);
          const overdue = !rem.completed && isPast(date);
          const today = isToday(date);
          const linkedTask = rem.taskId ? tasks.find((t) => t.id === rem.taskId) : null;

          return (
            <div
              key={rem.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                rem.completed
                  ? "bg-secondary/50 border-border/50 opacity-60"
                  : overdue
                  ? "bg-cat-b/5 border-cat-b/30"
                  : "bg-card border-border"
              }`}
            >
              <button onClick={() => toggleReminder(rem.id)} className="flex-shrink-0">
                {rem.completed ? (
                  <BellOff size={16} className="text-muted-foreground" />
                ) : (
                  <Bell size={16} className={overdue ? "text-cat-b" : "text-primary"} />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${rem.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {rem.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-mono ${overdue ? "text-cat-b" : today ? "text-cat-g" : "text-muted-foreground"}`}>
                    {format(date, "MMM d, h:mm a")}
                  </span>
                  {rem.recurring && (
                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">
                      {rem.recurring}
                    </span>
                  )}
                  {linkedTask && (
                    <span className="text-[10px] text-primary">→ {linkedTask.title}</span>
                  )}
                </div>
              </div>
              <button onClick={() => deleteReminder(rem.id)} className="text-muted-foreground hover:text-destructive p-1">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {reminders.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">No reminders yet</p>
        </div>
      )}
    </div>
  );
}
