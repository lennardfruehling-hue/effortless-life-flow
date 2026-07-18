import { useEffect, useMemo, useRef, useState } from "react";
import { useCloudState } from "@/hooks/useCloudState";
import { useAuth } from "@/hooks/useAuth";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { syncHabitsToTasksAndReminders } from "@/lib/habitSync";

import {
  Habit,
  HabitFrequency,
  WEEKDAYS,
  habitBestStreak,
  habitStreak,
  isHabitCompleteOn,
  isHabitDue,
  requiredCount,
  todayISO,
  toggleHabitSlot,
} from "@/lib/habits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Check, Flame, Pencil, Plus, Trash2, X, Clock, ListChecks } from "lucide-react";

const EMPTY_HABIT: Omit<Habit, "id" | "createdAt" | "log"> = {
  name: "",
  emoji: "",
  frequency: "daily",
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  weeklyDay: 1,
  cycleStart: todayISO(),
  times: [],
  notes: "",
  pushedToTasks: false,
};

export default function HabitTracker() {
  const [habits, setHabits, loaded] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const { user } = useAuth();
  const [editing, setEditing] = useState<Habit | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const today = todayISO();

  // Sync habits with times → to-do tasks + reminders whenever habits change.
  const syncTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!user || !loaded) return;
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      syncHabitsToTasksAndReminders(user.id, habits).catch((e) =>
        console.warn("[habits] sync failed", e)
      );
    }, 600);
    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, [habits, user?.id, loaded]);



  const sorted = useMemo(() => {
    const arr = [...habits];
    arr.sort((a, b) => {
      const ad = isHabitDue(a, today) ? 0 : 1;
      const bd = isHabitDue(b, today) ? 0 : 1;
      if (ad !== bd) return ad - bd;
      const at = a.times[0] ?? "99:99";
      const bt = b.times[0] ?? "99:99";
      if (at !== bt) return at.localeCompare(bt);
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [habits, today]);

  const openNew = () => {
    setEditing({
      ...EMPTY_HABIT,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      log: {},
    });
    setDialogOpen(true);
  };

  const openEdit = (h: Habit) => {
    setEditing({ ...h });
    setDialogOpen(true);
  };

  const save = () => {
    if (!editing || !editing.name.trim()) return;
    setHabits((prev) => {
      const idx = prev.findIndex((h) => h.id === editing.id);
      if (idx === -1) return [...prev, editing];
      const copy = [...prev];
      copy[idx] = editing;
      return copy;
    });
    setDialogOpen(false);
    setEditing(null);
  };

  const remove = (id: string) => {
    if (!confirm("Delete this habit? Log history will be lost.")) return;
    setHabits((prev) => prev.filter((h) => h.id !== id));
  };

  const toggleSlot = (h: Habit, slot: string) => {
    setHabits((prev) => prev.map((x) => (x.id === h.id ? toggleHabitSlot(x, today, slot) : x)));
  };

  if (!loaded) {
    return <div className="text-sm text-muted-foreground">Loading habits…</div>;
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">Habits &amp; Consistency Trackers</h3>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus size={14} className="mr-1" /> New habit
        </Button>
      </div>

      {habits.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add a habit to track — meditation, exercise, language study, water intake… Choose the frequency
          (daily, bi-daily, weekly, or specific weekdays) and optional times of day.
        </p>
      )}

      {sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((h) => {
            const due = isHabitDue(h, today);
            return (
              <HabitRow
                key={h.id}
                habit={h}
                onToggle={(slot) => toggleSlot(h, slot)}
                onEdit={() => openEdit(h)}
                onDelete={() => remove(h.id)}
                onTogglePush={() =>
                  setHabits((prev) =>
                    prev.map((x) => (x.id === h.id ? { ...x, pushedToTasks: !x.pushedToTasks } : x))
                  )
                }
                today={today}
                muted={!due}
              />
            );
          })}
        </div>
      )}

      <HabitDialog
        open={dialogOpen}
        habit={editing}
        onChange={setEditing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSave={save}
      />
    </section>
  );
}

function HabitRow({
  habit,
  today,
  onToggle,
  onEdit,
  onDelete,
  muted,
}: {
  habit: Habit;
  today: string;
  onToggle: (slot: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  muted?: boolean;
}) {
  const streak = habitStreak(habit);
  const best = habitBestStreak(habit);
  const complete = isHabitCompleteOn(habit, today);
  const doneToday = habit.log[today] ?? [];
  const slots = habit.times.length ? habit.times : ["any"];

  return (
    <div className={`rounded-md border border-border bg-background/40 p-3 ${muted ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {habit.emoji && <span className="text-base">{habit.emoji}</span>}
            <span className={`text-sm font-medium truncate ${complete ? "text-primary" : "text-foreground"}`}>
              {habit.name}
            </span>
            {complete && <Check size={14} className="text-primary" />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground mt-0.5 font-mono">
            <span>{frequencyLabel(habit)}</span>
            {habit.times.length > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={10} /> {habit.times.join(" · ")}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Flame size={10} className="text-cat-f" /> {streak}d · best {best}d
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            aria-label="Edit habit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            aria-label="Delete habit"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {slots.map((slot) => {
          const done = doneToday.includes(slot);
          return (
            <button
              key={slot}
              onClick={() => onToggle(slot)}
              className={`text-[11px] px-2 py-1 rounded-full border font-mono transition ${
                done
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {done ? "✓ " : "○ "}
              {slot === "any" ? "Mark done" : slot}
            </button>
          );
        })}
        <span className="text-[11px] text-muted-foreground self-center ml-auto">
          {doneToday.length}/{requiredCount(habit)} today
        </span>
      </div>
    </div>
  );
}

function frequencyLabel(h: Habit): string {
  switch (h.frequency) {
    case "daily":
      return "Daily";
    case "bi-daily":
      return "Every other day";
    case "weekly":
      return `Weekly · ${WEEKDAYS[h.weeklyDay ?? 1]}`;
    case "custom":
      return (h.weekdays ?? []).map((d) => WEEKDAYS[d]).join(", ") || "Custom";
  }
}

function HabitDialog({
  open,
  habit,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  habit: Habit | null;
  onChange: (h: Habit) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!habit) return null;

  const setField = <K extends keyof Habit>(k: K, v: Habit[K]) =>
    onChange({ ...habit, [k]: v });

  const toggleWeekday = (d: number) => {
    const cur = new Set(habit.weekdays ?? []);
    if (cur.has(d)) cur.delete(d);
    else cur.add(d);
    setField("weekdays", Array.from(cur).sort());
  };

  const addTime = () => setField("times", [...habit.times, "08:00"]);
  const setTime = (i: number, t: string) =>
    setField(
      "times",
      habit.times.map((x, ix) => (ix === i ? t : x))
    );
  const removeTime = (i: number) =>
    setField(
      "times",
      habit.times.filter((_, ix) => ix !== i)
    );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Habit</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="w-16">
              <Label className="text-xs">Emoji</Label>
              <Input
                value={habit.emoji ?? ""}
                onChange={(e) => setField("emoji", e.target.value)}
                placeholder="🧘"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={habit.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Meditate 10 min"
                autoFocus
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Frequency</Label>
            <Select
              value={habit.frequency}
              onValueChange={(v) => setField("frequency", v as HabitFrequency)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="bi-daily">Bi-daily (every other day)</SelectItem>
                <SelectItem value="weekly">Weekly (one day)</SelectItem>
                <SelectItem value="custom">Custom weekdays</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {habit.frequency === "weekly" && (
            <div>
              <Label className="text-xs">Day of week</Label>
              <div className="flex gap-1 mt-1 flex-wrap">
                {WEEKDAYS.map((w, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setField("weeklyDay", i)}
                    className={`text-xs px-2.5 py-1 rounded border ${
                      (habit.weeklyDay ?? 1) === i
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}

          {habit.frequency === "custom" && (
            <div>
              <Label className="text-xs">Weekdays</Label>
              <div className="flex gap-1 mt-1 flex-wrap">
                {WEEKDAYS.map((w, i) => {
                  const active = (habit.weekdays ?? []).includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      className={`text-xs px-2.5 py-1 rounded border ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {habit.frequency === "bi-daily" && (
            <div>
              <Label className="text-xs">Cycle start date</Label>
              <Input
                type="date"
                value={habit.cycleStart ?? todayISO()}
                onChange={(e) => setField("cycleStart", e.target.value)}
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Times of day (optional)</Label>
              <Button size="sm" variant="ghost" onClick={addTime}>
                <Plus size={12} className="mr-1" /> Add time
              </Button>
            </div>
            {habit.times.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Leave empty for a single "any time" checkbox. Add multiple slots to track morning/evening etc.
              </p>
            )}
            <div className="space-y-1.5 mt-1">
              {habit.times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={t}
                    onChange={(e) => setTime(i, e.target.value)}
                    className="w-32"
                  />
                  <button
                    onClick={() => removeTime(i)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Remove time"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={habit.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Why this habit matters, cue, reward…"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!habit.name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
