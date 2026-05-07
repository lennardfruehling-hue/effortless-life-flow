import { useState } from "react";
import { Task, Category, ALL_CATEGORIES, CATEGORY_META, Project } from "@/lib/types";
import { CategoryBadgeFull } from "./CategoryBadge";
import { v4 as uuid } from "uuid";
import { X } from "lucide-react";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import AssigneePicker from "./AssigneePicker";

interface TaskFormProps {
  projects: Project[];
  onSubmit: (task: Task) => void;
  onClose: () => void;
  editTask?: Task;
}

export default function TaskForm({ projects, onSubmit, onClose, editTask }: TaskFormProps) {
  const [title, setTitle] = useState(editTask?.title || "");
  const [description, setDescription] = useState(editTask?.description || "");
  const [categories, setCategories] = useState<Category[]>(editTask?.categories || []);
  const [projectId, setProjectId] = useState(editTask?.projectId || "");
  const [location, setLocation] = useState(editTask?.location || "");
  const [hateMagnitude, setHateMagnitude] = useState(editTask?.hateMagnitude || 5);
  const [duration, setDuration] = useState(editTask?.duration || 0);
  const [dueDate, setDueDate] = useState(editTask?.dueDate || "");
  const [assigneeId, setAssigneeId] = useState<string | null>(editTask?.assigneeId ?? null);
  const { members } = useHouseholdMembers();

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
      assigneeId: assigneeId || null,
    };
    onSubmit(task);
  };

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

        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Due date (optional)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
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

        {categories.includes("D") && (
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Where is this?"
            />
          </div>
        )}

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
