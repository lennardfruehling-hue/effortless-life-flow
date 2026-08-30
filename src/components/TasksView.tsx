import { useState, useMemo, useEffect } from "react";
import { Task, Category, ALL_CATEGORIES, CATEGORY_META, Project, DailyScheduleSlot } from "@/lib/types";
import TaskCard from "@/components/TaskCard";
import TaskForm from "@/components/TaskForm";
import CalendarScheduleDay from "@/components/CalendarScheduleDay";
import WeeklyView from "@/components/WeeklyView";
import GameConsole from "@/components/GameConsole";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import type { WeeklyStructureBlock } from "@/lib/types";

import SerpentDailyList from "@/components/SerpentDailyList";
import ScoreCard from "@/components/ScoreCard";
import FinanceSummaryCard from "@/components/FinanceSummaryCard";
import { CategoryBadgeFull } from "@/components/CategoryBadge";
import { Plus, Filter, Eye, EyeOff, Clock, X, Sparkles, Repeat, Sun, CalendarDays, AlertTriangle, ChevronDown, CalendarRange } from "lucide-react";
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

/** Collapsible-free section wrapper giving the task list a clear structure. */
function Section({
  icon,
  title,
  subtitle,
  count,
  empty,
  showEmpty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  count?: string;
  empty?: string;
  showEmpty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2.5 pb-1.5 border-b border-border">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </span>
        {count && <span className="text-xs font-mono text-muted-foreground">{count}</span>}
        {subtitle && <span className="ml-auto text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="space-y-2">
        {showEmpty && empty ? <p className="text-xs text-muted-foreground py-3">{empty}</p> : children}
      </div>
    </section>
  );
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

type SectionKey = "today" | "daily" | "weekly" | "upcoming";
const SECTION_PREF_KEY = "serpent-task-sections-v1";

export default function TasksView({ tasks, projects, onSave, dailySchedule, onSaveDailySchedule, filterProjectId, onClearProjectFilter }: TasksViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [showOverdue, setShowOverdue] = useState(() => localStorage.getItem("serpent-overdue-open") !== "false");

  const [editTask, setEditTask] = useState<Task | undefined>();
  const [filterCat, setFilterCat] = useState<Category | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showSchedule, setShowSchedule] = useState(() => {
    try {
      const raw = localStorage.getItem("serpent-tasks-schedule-dock");
      if (raw !== null) return raw === "1";
    } catch { /* ignore */ }
    return true;
  });


  const [showWeekly, setShowWeekly] = useState(() => {
    try { return localStorage.getItem("serpent-tasks-weekly-view") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("serpent-tasks-weekly-view", showWeekly ? "1" : "0"); } catch { /* ignore */ }
  }, [showWeekly]);

  const [weeklyStructure] = useCloudState<WeeklyStructureBlock[]>(CLOUD_KEYS.weeklyStructure, []);

  useEffect(() => {
    try { localStorage.setItem("serpent-tasks-schedule-dock", showSchedule ? "1" : "0"); } catch { /* ignore */ }
  }, [showSchedule]);

  const [activeSections, setActiveSections] = useState<SectionKey[]>(() => {
    try {
      const raw = localStorage.getItem(SECTION_PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as SectionKey[];
      }
    } catch { /* ignore */ }
    return ["today"];
  });

  useEffect(() => {
    try { localStorage.setItem(SECTION_PREF_KEY, JSON.stringify(activeSections)); } catch { /* ignore */ }
  }, [activeSections]);

  const toggleSection = (key: SectionKey) =>
    setActiveSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const isOn = (key: SectionKey) => activeSections.includes(key);


  // Reset recurring tasks when their period rolls over
  useEffect(() => {
    const { tasks: reset, changed } = applyRecurrenceReset(tasks);
    if (changed) onSave(reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Broadcast schedule-active state so the sidebar can swap to its strike backdrop.
  useEffect(() => {
    document.body.dataset.scheduleActive = showSchedule ? "1" : "0";
    window.dispatchEvent(new CustomEvent("schedule-active-change", { detail: showSchedule }));
    return () => {
      document.body.dataset.scheduleActive = "0";
      window.dispatchEvent(new CustomEvent("schedule-active-change", { detail: false }));
    };
  }, [showSchedule]);

  const dailyTasks = useMemo(() => tasks.filter((t) => t.recurrence === "daily"), [tasks]);
  const weeklyTasks = useMemo(() => tasks.filter((t) => t.recurrence === "weekly"), [tasks]);

  const filteredTasks = useMemo(() => {
    let list = tasks.filter((t) => !t.recurrence); // recurring shown in their own groups
    if (filterProjectId) list = list.filter((t) => t.projectId === filterProjectId);
    if (filterCat) list = list.filter((t) => t.categories.includes(filterCat));
    if (!showCompleted) list = list.filter((t) => !t.completed);
    return sortTasks(list);
  }, [tasks, filterCat, showCompleted, filterProjectId]);

  // Split the non-recurring list into "Overdue", "Today" and "Upcoming / backlog".
  const { overdueTasks, todayTasks, laterTasks } = useMemo(() => {
    const today = todayKey();
    const isOverdue = (t: Task) => !t.completed && !!t.dueDate && t.dueDate < today;
    const isToday = (t: Task) =>
      (t.dueDate && t.dueDate <= today) || t.categories.includes("A1");
    return {
      overdueTasks: filteredTasks.filter(isOverdue),
      todayTasks: filteredTasks.filter((t) => !isOverdue(t) && isToday(t)),
      laterTasks: filteredTasks.filter((t) => !isOverdue(t) && !isToday(t)),
    };
  }, [filteredTasks]);


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
            data-tour="schedule-toggle"
            onClick={() => setShowSchedule(!showSchedule)}
            className={`flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-md text-sm border transition-colors whitespace-nowrap ${
              showSchedule ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border hover:border-primary/20"
            }`}
            title="Schedule"
          >
            <Clock size={14} /> <span className="hidden sm:inline">Schedule</span>
          </button>
          <button
            onClick={() => setShowWeekly(!showWeekly)}
            className={`flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-md text-sm border transition-colors whitespace-nowrap ${
              showWeekly ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border hover:border-primary/20"
            }`}
            title="Weekly View"
          >
            <CalendarRange size={14} /> <span className="hidden sm:inline">Weekly View</span>
          </button>
          <button
            data-tour="add-task"
            onClick={() => { setEditTask(undefined); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 md:px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Plus size={16} /> <span className="hidden sm:inline">Add Task</span><span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Wealth Command Centre summary */}
      <FinanceSummaryCard />

      {/* Project filter banner */}
      {filterProject && (
        <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-md flex items-center justify-between">
          <span className="text-sm text-primary font-medium">Filtered: {filterProject.name}</span>
          <button onClick={onClearProjectFilter} className="text-primary hover:opacity-80"><X size={16} /></button>
        </div>
      )}

      <div className={showSchedule ? "grid grid-cols-[minmax(0,1.15fr)_minmax(190px,0.85fr)] md:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_440px] gap-2 md:gap-4 items-start" : ""}>
        <div className="min-w-0">

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
      {/* Daily consistency check-in */}
      <ScoreCard tasks={tasks} />
      {!showSchedule && <div className="mb-4"><GameConsole /></div>}

      {/* Overdue tasks — always first, collapsible */}
      {overdueTasks.length > 0 && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <button
            type="button"
            onClick={() => setShowOverdue((v) => { localStorage.setItem("serpent-overdue-open", String(!v)); return !v; })}
            aria-expanded={showOverdue}
            className="flex w-full items-center gap-2"
          >
            <AlertTriangle size={14} className="text-destructive" />
            <h2 className="text-sm font-semibold text-destructive">Overdue</h2>
            <span className="font-mono text-[10px] text-destructive/70">{overdueTasks.length}</span>
            <ChevronDown
              size={14}
              className={`ml-auto text-destructive/70 transition-transform ${showOverdue ? "rotate-180" : ""}`}
            />
          </button>
          {showOverdue && (
            <div className="space-y-2 mt-2">
              <AnimatePresence mode="popLayout">
                {overdueTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onToggle={handleToggle} onEdit={(t) => { setEditTask(t); setShowForm(true); }} onDelete={handleDelete} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}


      {/* Serpent prioritised daily list */}
      <SerpentDailyList tasks={tasks} onToggle={handleToggle} onEdit={(t) => { setEditTask(t); setShowForm(true); }} />

      {/* Task group toggles */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Groups</span>
        {([
          { key: "today", label: "Today", count: todayTasks.length },
          { key: "daily", label: "Daily", count: dailyTasks.length },
          { key: "weekly", label: "Weekly", count: weeklyTasks.length },
          { key: "upcoming", label: "Upcoming", count: laterTasks.length },
        ] as { key: SectionKey; label: string; count: number }[]).map((s) => (
          <button
            key={s.key}
            onClick={() => toggleSection(s.key)}
            aria-pressed={isOn(s.key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              isOn(s.key)
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:border-primary/30"
            }`}
          >
            {s.label}
            <span className="ml-1 opacity-70 font-mono text-[10px]">{s.count}</span>
          </button>
        ))}
      </div>

      {/* Structured sections: Today → Daily → Weekly → Upcoming */}
      <div className="mt-4 space-y-7">
        {activeSections.length === 0 && (
          <p className="text-xs text-muted-foreground py-6 text-center">Select a task group above to show tasks.</p>
        )}
        {isOn("today") && (
          <Section
            icon={<Sun size={13} />}
            title="Today"
            count={`${todayTasks.filter((t) => t.completed).length}/${todayTasks.length}`}
            empty="Nothing scheduled for today."
            showEmpty={todayTasks.length === 0}
          >
            <AnimatePresence mode="popLayout">
              {todayTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggle={handleToggle} onEdit={(t) => { setEditTask(t); setShowForm(true); }} onDelete={handleDelete} />
              ))}
            </AnimatePresence>
          </Section>
        )}

        {isOn("daily") && (
          <Section
            icon={<Repeat size={13} />}
            title="Daily"
            subtitle="Recurring every day"
            count={`${dailyTasks.filter((t) => t.completed).length}/${dailyTasks.length}`}
            empty="No daily recurring tasks."
            showEmpty={dailyTasks.length === 0}
          >
            {dailyTasks.map((task) => (
              <TaskCard key={task.id} task={task} onToggle={handleToggle} onEdit={(t) => { setEditTask(t); setShowForm(true); }} onDelete={handleDelete} />
            ))}
          </Section>
        )}

        {isOn("weekly") && (
          <Section
            icon={<Repeat size={13} />}
            title="Weekly"
            subtitle="Recurring every week"
            count={`${weeklyTasks.filter((t) => t.completed).length}/${weeklyTasks.length}`}
            empty="No weekly recurring tasks."
            showEmpty={weeklyTasks.length === 0}
          >
            {weeklyTasks.map((task) => (
              <TaskCard key={task.id} task={task} onToggle={handleToggle} onEdit={(t) => { setEditTask(t); setShowForm(true); }} onDelete={handleDelete} />
            ))}
          </Section>
        )}

        {isOn("upcoming") && (
          <Section
            icon={<CalendarDays size={13} />}
            title="Upcoming"
            subtitle="Everything else"
            count={`${laterTasks.length}`}
            empty="Nothing upcoming."
            showEmpty={laterTasks.length === 0}
          >
            <AnimatePresence mode="popLayout">
              {laterTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggle={handleToggle} onEdit={(t) => { setEditTask(t); setShowForm(true); }} onDelete={handleDelete} />
              ))}
            </AnimatePresence>
          </Section>
        )}
      </div>


      {filteredTasks.length === 0 && dailyTasks.length === 0 && weeklyTasks.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">
            {filterCat ? `No tasks in ${filterCat}` : filterProjectId ? "No tasks linked to this project" : "No tasks yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your first task to start getting organized 🐍
          </p>
        </div>
      )}
        </div>

        {/* Docked daily calendar — drop tasks here to time-box them */}
        {showSchedule && (
          <aside className="min-w-0 sticky top-4 space-y-2">
            <GameConsole />
            <CalendarScheduleDay
              compact
              slots={dailySchedule}
              tasks={tasks}
              onSaveSlots={onSaveDailySchedule}
              onEditTask={(t) => { setEditTask(t); setShowForm(true); }}
            />
          </aside>
        )}

      </div>




      {(showForm || editTask) && (
        <TaskForm
          projects={projects}
          tasks={tasks}
          editTask={editTask}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditTask(undefined); }}
        />
      )}
    </div>
  );
}
