import { useState, useMemo, useEffect } from "react";
import { Task, Category, ALL_CATEGORIES, CATEGORY_META, Project, DailyScheduleSlot } from "@/lib/types";
import TaskCard from "@/components/TaskCard";
import TaskForm from "@/components/TaskForm";
import CalendarScheduleDay from "@/components/CalendarScheduleDay";
import { CategoryBadgeFull } from "@/components/CategoryBadge";
import { Plus, Filter, Eye, EyeOff, Clock, X, Sparkles, Repeat } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { applyRecurrenceReset, todayKey, weekKey, totalPride, prideThisWeek } from "@/lib/pride";

interface TasksViewProps {
  tasks: Task[];
  projects: Project[];
  onSave: (tasks: Task[]) => void;
  dailySchedule: DailyScheduleSlot[];
  onSaveDailySchedule: (slots: DailyScheduleSlot[]) => void;
  filterProjectId?: string;
  onClearProjectFilter?: () => void;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const aHasA1 = a.categories.includes("A1");
    const bHasA1 = b.categories.includes("A1");
    if (aHasA1 !== bHasA1) return aHasA1 ? -1 : 1;
    const aHasB1 = a.categories.includes("B1");
    const bHasB1 = b.categories.includes("B1");
    if (aHasB1 !== bHasB1) return aHasB1 ? -1 : 1;
    return b.categories.length - a.categories.length;
  });
}

export default function TasksView({ tasks, projects, onSave, dailySchedule, onSaveDailySchedule, filterProjectId, onClearProjectFilter }: TasksViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>();
  const [filterCat, setFilterCat] = useState<Category | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // Reset recurring tasks when their period rolls over
  useEffect(() => {
    const { tasks: reset, changed } = applyRecurrenceReset(tasks);
    if (changed) onSave(reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dailyTasks = useMemo(() => tasks.filter((t) => t.recurrence === "daily"), [tasks]);
  const weeklyTasks = useMemo(() => tasks.filter((t) => t.recurrence === "weekly"), [tasks]);

  const filteredTasks = useMemo(() => {
    let list = tasks.filter((t) => !t.recurrence); // recurring shown in their own groups
    if (filterProjectId) list = list.filter((t) => t.projectId === filterProjectId);
    if (filterCat) list = list.filter((t) => t.categories.includes(filterCat));
    if (!showCompleted) list = list.filter((t) => !t.completed);
    return sortTasks(list);
  }, [tasks, filterCat, showCompleted, filterProjectId]);

  const handleSubmit = (task: Task) => {
    const existing = tasks.findIndex((t) => t.id === task.id);
    const updated = existing >= 0
      ? tasks.map((t) => (t.id === task.id ? task : t))
      : [...tasks, task];
    onSave(updated);
    setShowForm(false);
    setEditTask(undefined);
  };

  const handleToggle = (id: string) => {
    onSave(
      tasks.map((t) => {
        if (t.id !== id) return t;
        const nowCompleted = !t.completed;
        const period = t.recurrence === "weekly" ? weekKey() : todayKey();
        return {
          ...t,
          completed: nowCompleted,
          completedAt: nowCompleted ? new Date().toISOString() : undefined,
          lastCompletedPeriod: t.recurrence && nowCompleted ? period : t.lastCompletedPeriod,
        };
      })
    );
  };

  const handleDelete = (id: string) => {
    onSave(tasks.filter((t) => t.id !== id));
  };

  const todayCount = tasks.filter((t) => !t.completed && t.categories.includes("A1")).length;
  const activeCount = tasks.filter((t) => !t.completed).length;
  const filterProject = filterProjectId ? projects.find(p => p.id === filterProjectId) : null;
  const prideTotal = totalPride(tasks);
  const prideWeek = prideThisWeek(tasks);

  return (
    <div className="flex-1 p-4 md:p-6 overflow-y-auto scrollbar-thin min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-6 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-foreground">Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {todayCount > 0 && (
              <span className="text-destructive font-medium">{todayCount} due today · </span>
            )}
            {activeCount} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-cat-h/10 border border-cat-h/30 text-cat-h text-xs font-mono" title="Pride score (proud-flagged tasks)">
            <Sparkles size={13} />
            <span>{prideTotal}</span>
            <span className="opacity-60">· +{prideWeek} wk</span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setShowSchedule(!showSchedule)}
            className={`flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-md text-sm border transition-colors whitespace-nowrap ${
              showSchedule ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border hover:border-primary/20"
            }`}
            title="Schedule"
          >
            <Clock size={14} /> <span className="hidden sm:inline">Schedule</span>
          </button>
          <button
            onClick={() => { setEditTask(undefined); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 md:px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Plus size={16} /> <span className="hidden sm:inline">Add Task</span><span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Project filter banner */}
      {filterProject && (
        <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-md flex items-center justify-between">
          <span className="text-sm text-primary font-medium">Filtered: {filterProject.name}</span>
          <button onClick={onClearProjectFilter} className="text-primary hover:opacity-80"><X size={16} /></button>
        </div>
      )}

      {/* Daily Schedule */}
      {showSchedule && (
        <div className="mb-6">
          <CalendarScheduleDay slots={dailySchedule} tasks={tasks} onSaveSlots={onSaveDailySchedule} />
        </div>
      )}

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

      {/* Daily / Weekly recurring groups */}
      {(dailyTasks.length > 0 || weeklyTasks.length > 0) && (
        <div className="mb-6 space-y-4">
          {dailyTasks.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground mb-2 font-mono">
                <Repeat size={12} /> Daily ({dailyTasks.filter((t) => t.completed).length}/{dailyTasks.length})
              </h3>
              <div className="space-y-2">
                {dailyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onToggle={handleToggle} onEdit={(t) => { setEditTask(t); setShowForm(true); }} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}
          {weeklyTasks.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground mb-2 font-mono">
                <Repeat size={12} /> Weekly ({weeklyTasks.filter((t) => t.completed).length}/{weeklyTasks.length})
              </h3>
              <div className="space-y-2">
                {weeklyTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onToggle={handleToggle} onEdit={(t) => { setEditTask(t); setShowForm(true); }} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}
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
            {filterCat ? `No tasks in ${filterCat}` : filterProjectId ? "No tasks linked to this project" : "No tasks yet"}
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
