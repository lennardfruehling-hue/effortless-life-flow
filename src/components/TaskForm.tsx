import { useEffect, useState } from "react";
import { Task, Category, ALL_CATEGORIES, CATEGORY_META, Project } from "@/lib/types";
import { CategoryBadgeFull } from "./CategoryBadge";
import { v4 as uuid } from "uuid";
import { X, Sparkles } from "lucide-react";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import AssigneePicker from "./AssigneePicker";
import { supabase } from "@/integrations/supabase/client";
import { pridePointsForTask } from "@/lib/pride";

interface TaskFormProps {
  projects: Project[];
  tasks?: Task[];
  onSubmit: (task: Task) => void;
  onClose: () => void;
  editTask?: Task;
}

export default function TaskForm({ projects, tasks = [], onSubmit, onClose, editTask }: TaskFormProps) {
  const knownLocations = Array.from(
    new Set(
      tasks
        .map((t) => (t.location || "").trim())
        .filter((l) => l.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
  const [title, setTitle] = useState(editTask?.title || "");
  const [description, setDescription] = useState(editTask?.description || "");
  const [categories, setCategories] = useState<Category[]>(editTask?.categories || []);
  const [projectId, setProjectId] = useState(editTask?.projectId || "");
  const [location, setLocation] = useState(editTask?.location || "");
  const [hateMagnitude, setHateMagnitude] = useState(editTask?.hateMagnitude || 5);
  const [duration, setDuration] = useState(editTask?.duration || 0);
  const [dueDate, setDueDate] = useState(editTask?.dueDate || "");
  const [dueTime, setDueTime] = useState(editTask?.dueTime || "");
  const [assigneeId, setAssigneeId] = useState<string | null>(editTask?.assigneeId ?? null);
  const [makesProud, setMakesProud] = useState<boolean>(editTask?.makesProud ?? false);
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly">(editTask?.recurrence ?? "none");
  const [linkedListId, setLinkedListId] = useState<string>(editTask?.linkedListId ?? "");
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const { members } = useHouseholdMembers();

  useEffect(() => {
    supabase.from("task_lists").select("id,name").order("updated_at", { ascending: false }).then(({ data }) => {
      if (data) setLists(data as any);
    });
  }, []);

  const toggleCat = (cat: Category) =>
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || categories.length === 0) return;

    const task: Task = {
      id: editTask?.id || uuid(),
      title: title.trim(),
      description: description.trim() || undefined,
      categories,
      completed: editTask?.completed || false,
      createdAt: editTask?.createdAt || new Date().toISOString(),
      projectId: projectId || undefined,
      location: location.trim() || undefined,
      hateMagnitude: categories.includes("F") ? hateMagnitude : undefined,
      duration: duration > 0 ? duration : undefined,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      assigneeId: assigneeId || null,
      makesProud: categories.includes("H"),
      recurrence: recurrence === "none" ? undefined : recurrence,
      linkedListId: linkedListId || undefined,
    };
    onSubmit(task);
  };

  const projectedPride = pridePointsForTask({ ...((editTask || {}) as Task), duration, makesProud: categories.includes("H"), completed: true } as Task);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {editTask ? "Edit Task" : "New Task"}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="What needs to be done?"
            autoFocus
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            placeholder="Any details..."
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Duration (minutes)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={duration || ""}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-32 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="0"
            />
            {duration > 0 && (
              <span className="text-xs text-muted-foreground font-mono">
                {duration >= 60 ? `${Math.floor(duration/60)}h ${duration%60 > 0 ? `${duration%60}m` : ""}` : `${duration}m`}
              </span>
            )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Due date (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Time of day (optional)</label>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Triggers an alarm when overdue.</p>
          </div>
        </div>
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            Categories <span className="text-destructive">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCat(cat)}
                className={`transition-all ${
                  categories.includes(cat)
                    ? "ring-1 ring-primary scale-105"
                    : "opacity-50 hover:opacity-80"
                }`}
              >
                <CategoryBadgeFull category={cat} />
              </button>
            ))}
          </div>
          {categories.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {categories.length} {categories.length === 1 ? "category" : "categories"} selected — priority score: {categories.length}
            </p>
          )}
        </div>

        {categories.includes("F") && (
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              Hate magnitude: {hateMagnitude}/10
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={hateMagnitude}
              onChange={(e) => setHateMagnitude(Number(e.target.value))}
              className="w-full accent-cat-f"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Mild annoyance</span>
              <span>Ballistic 🚀</span>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm text-muted-foreground mb-1 block">
            Location {categories.includes("D") ? <span className="text-destructive">*</span> : <span className="text-muted-foreground/60">(optional)</span>}
          </label>
          <input
            list="task-known-locations"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={categories.includes("D") ? "Where is this? (e.g. Downtown, Home, Office)" : "Pick or type a place"}
          />
          {knownLocations.length > 0 && (
            <datalist id="task-known-locations">
              {knownLocations.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          )}
          {knownLocations.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {knownLocations.slice(0, 8).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocation(loc)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    location === loc
                      ? "bg-cat-d/20 text-cat-d border-cat-d/40"
                      : "text-muted-foreground border-border hover:border-cat-d/40 hover:text-cat-d"
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          )}
          {categories.includes("D") && (
            <p className="text-[10px] text-muted-foreground mt-1">Category D · Nearby — group with other tasks at the same place.</p>
          )}
        </div>

        {projects.length > 0 && (
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Project (optional)</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Assign this task to a Life Plan project.</p>
          </div>
        )}

        {members.length >= 1 && (
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Assign to</label>
            <select
              value={assigneeId || ""}
              onChange={(e) => setAssigneeId(e.target.value || null)}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Unassigned</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.display_name || "Member"}</option>
              ))}
            </select>
          </div>
        )}

        {categories.includes("H") && projectedPride > 0 && (
          <div className="rounded-md border border-cat-h/30 bg-cat-h/10 p-3 flex items-center gap-2 text-sm">
            <Sparkles size={14} className="text-cat-h" />
            <span className="text-foreground">Category H · Proud — counts toward Pride score.</span>
            <span className="ml-auto text-xs font-mono text-cat-h">+{projectedPride} pride</span>
          </div>
        )}

        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Recurrence</label>
          <div className="flex gap-2">
            {(["none", "daily", "weekly"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRecurrence(r)}
                className={`px-3 py-1.5 rounded text-xs font-mono border transition-colors ${
                  recurrence === r
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "text-muted-foreground border-border hover:border-primary/20"
                }`}
              >
                {r === "none" ? "One-off" : r === "daily" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
          {recurrence !== "none" && (
            <p className="text-[11px] text-muted-foreground mt-1">Auto-resets every {recurrence === "daily" ? "day" : "week"} and feeds your consistency streak.</p>
          )}
        </div>

        {lists.length > 0 && (
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Linked list (optional)</label>
            <select
              value={linkedListId}
              onChange={(e) => setLinkedListId(e.target.value)}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">None</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Open this list when running the routine.</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={!title.trim() || categories.length === 0}
            className="flex-1 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            {editTask ? "Update" : "Add Task"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
