import { useState, useMemo } from "react";
import { Task, Category, ALL_CATEGORIES, CATEGORY_META, Project } from "@/lib/types";
import TaskCard from "@/components/TaskCard";
import TaskForm from "@/components/TaskForm";
import { CategoryBadgeFull } from "@/components/CategoryBadge";
import { Plus, Filter, SortDesc, Eye, EyeOff } from "lucide-react";
import { AnimatePresence } from "framer-motion";

interface TasksViewProps {
  tasks: Task[];
  projects: Project[];
  onSave: (tasks: Task[]) => void;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    // A1 first
    const aHasA1 = a.categories.includes("A1");
    const bHasA1 = b.categories.includes("A1");
    if (aHasA1 !== bHasA1) return aHasA1 ? -1 : 1;
    // B1 next
    const aHasB1 = a.categories.includes("B1");
    const bHasB1 = b.categories.includes("B1");
    if (aHasB1 !== bHasB1) return aHasB1 ? -1 : 1;
    // Then by category count (more = higher priority)
    return b.categories.length - a.categories.length;
  });
}

export default function TasksView({ tasks, projects, onSave }: TasksViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>();
  const [filterCat, setFilterCat] = useState<Category | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (filterCat) list = list.filter((t) => t.categories.includes(filterCat));
    if (!showCompleted) list = list.filter((t) => !t.completed);
    return sortTasks(list);
  }, [tasks, filterCat, showCompleted]);

  const handleSubmit = (task: Task) => {
    console.log("[TasksView] handleSubmit called with task:", task);
    const existing = tasks.findIndex((t) => t.id === task.id);
    const updated = existing >= 0
      ? tasks.map((t) => (t.id === task.id ? task : t))
      : [...tasks, task];
    console.log("[TasksView] saving updated tasks, count:", updated.length);
    onSave(updated);
    setShowForm(false);
    setEditTask(undefined);
  };

  const handleToggle = (id: string) => {
    onSave(
      tasks.map((t) =>
        t.id === id
          ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined }
          : t
      )
    );
  };

  const handleDelete = (id: string) => {
    onSave(tasks.filter((t) => t.id !== id));
  };

  const todayCount = tasks.filter((t) => !t.completed && t.categories.includes("A1")).length;
  const activeCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {todayCount > 0 && (
              <span className="text-cat-b font-medium">{todayCount} due today · </span>
            )}
            {activeCount} active
          </p>
        </div>
        <button
          onClick={() => { setEditTask(undefined); setShowForm(true); }}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> Add Task
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-thin">
        <Filter size={14} className="text-muted-foreground flex-shrink-0" />
        <button
          onClick={() => setFilterCat(null)}
          className={`text-xs px-2.5 py-1 rounded-sm border font-mono transition-colors flex-shrink-0 ${
            !filterCat
              ? "bg-primary/20 text-primary border-primary/30"
              : "text-muted-foreground border-border hover:border-primary/20"
          }`}
        >
          All
        </button>
        {ALL_CATEGORIES.map((cat) => {
          const count = tasks.filter((t) => !t.completed && t.categories.includes(cat)).length;
          return (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? null : cat)}
              className={`text-xs px-2.5 py-1 rounded-sm border font-mono transition-colors flex-shrink-0 whitespace-nowrap ${
                filterCat === cat
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "text-muted-foreground border-border hover:border-primary/20"
              }`}
            >
              {CATEGORY_META[cat].label}
              {count > 0 && <span className="ml-1 text-[10px] opacity-60">{count}</span>}
            </button>
          );
        })}
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          {showCompleted ? <EyeOff size={12} /> : <Eye size={12} />}
          {showCompleted ? "Hide" : "Show"} done
        </button>
      </div>

      {/* Filter description */}
      {filterCat && (
        <div className="mb-4 p-3 bg-secondary/50 rounded-md border border-border">
          <CategoryBadgeFull category={filterCat} />
          <p className="text-xs text-muted-foreground mt-1">{CATEGORY_META[filterCat].description}</p>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={handleToggle}
              onEdit={(t) => { setEditTask(t); setShowForm(true); }}
              onDelete={handleDelete}
            />
          ))}
        </AnimatePresence>
      </div>

      {filteredTasks.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">
            {filterCat ? `No tasks in ${filterCat}` : "No tasks yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your first task to start getting organized 🐍
          </p>
        </div>
      )}

      {(showForm || editTask) && (
        <TaskForm
          projects={projects}
          editTask={editTask}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditTask(undefined); }}
        />
      )}
    </div>
  );
}
