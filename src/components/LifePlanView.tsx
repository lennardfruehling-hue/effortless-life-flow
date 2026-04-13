import { useState, useEffect } from "react";
import { Save, Plus, Trash2, ChevronDown, ChevronRight, Calendar } from "lucide-react";

interface PlanningItem {
  id: string;
  name: string;
  when: string;
  done: boolean;
}

interface ProjectTask {
  id: string;
  task: string;
  deadline: string;
  done: boolean;
}

interface ProjectGroup {
  id: string;
  name: string;
  tasks: ProjectTask[];
  collapsed?: boolean;
}

interface LifePlanData {
  notes: string;
  planning: PlanningItem[];
  projects: ProjectGroup[];
}

const STORAGE_KEY = "serpent-lifeplan-v2";

function loadData(): LifePlanData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return getDefaultData();
}

function saveData(data: LifePlanData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function getDefaultData(): LifePlanData {
  return {
    notes: "",
    planning: [
      { id: uid(), name: "Serpent/Projects", when: "Mornings", done: false },
      { id: uid(), name: "Weekly Review", when: "Saturdays", done: false },
      { id: uid(), name: "Check-ins", when: "Saturdays", done: false },
    ],
    projects: [
      {
        id: uid(), name: "Student VISA / VISA Célida", tasks: [
          { id: uid(), task: "Get Marriage organized", deadline: "2025-02-22", done: false },
          { id: uid(), task: "Ensure translated marriage certificate is legalized properly and accepted in Ireland", deadline: "2026-02-10", done: false },
          { id: uid(), task: "Guide to prepare application beforehand", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Organize extra day", deadline: "2026-02-13", done: false },
        ],
      },
      {
        id: uid(), name: "Spanish – Lennard", tasks: [
          { id: uid(), task: "Practice Spanish on way home from work (min 2x/week)", deadline: "2026-02-20", done: false },
          { id: uid(), task: "Download torrent client + Spanish course", deadline: "2026-02-19", done: false },
          { id: uid(), task: "Build a Spanish curriculum with a full course", deadline: "2026-02-13", done: false },
        ],
      },
      {
        id: uid(), name: "German – Célida", tasks: [
          { id: uid(), task: "Develop project timeline", deadline: "2026-02-12", done: false },
          { id: uid(), task: "Develop next 2 lessons", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Download movies with German subtitles", deadline: "2026-02-15", done: false },
        ],
      },
      {
        id: uid(), name: "Community", tasks: [
          { id: uid(), task: "Find Kizomba class", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Check out Pathfinder", deadline: "2026-02-11", done: false },
          { id: uid(), task: "Browse events", deadline: "2026-02-14", done: false },
          { id: uid(), task: "Invite Brazilian guy over", deadline: "2026-02-16", done: false },
        ],
      },
      {
        id: uid(), name: "Househunt", tasks: [
          { id: uid(), task: "Look for places", deadline: "2026-02-12", done: false },
          { id: uid(), task: "Set up auto reminder", deadline: "2026-02-11", done: false },
          { id: uid(), task: "Talk to Célida about vision", deadline: "2026-02-15", done: false },
          { id: uid(), task: "Give notice", deadline: "2026-02-11", done: false },
          { id: uid(), task: "Create due diligence list", deadline: "2026-02-15", done: false },
        ],
      },
      {
        id: uid(), name: "Family and Baby", tasks: [
          { id: uid(), task: "Think about what the perfect space for a family looks like", deadline: "2026-03-07", done: false },
          { id: uid(), task: "Check out Brazilian woman for babysitter fit", deadline: "2026-02-13", done: false },
        ],
      },
      {
        id: uid(), name: "Legal Marriage", tasks: [
          { id: uid(), task: "Plan details", deadline: "2026-02-15", done: false },
          { id: uid(), task: "Book flights", deadline: "2026-03-01", done: false },
          { id: uid(), task: "Book hotels", deadline: "2026-03-01", done: false },
          { id: uid(), task: "Prepare for travel", deadline: "2026-03-01", done: false },
        ],
      },
      {
        id: uid(), name: "Jobsearch", tasks: [
          { id: uid(), task: "Create presentation", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Create spreadsheet", deadline: "2026-02-13", done: false },
        ],
      },
      {
        id: uid(), name: "Jobsearch Restaurant", tasks: [
          { id: uid(), task: "Print out resume", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Hand in resume", deadline: "2026-02-14", done: false },
        ],
      },
      {
        id: uid(), name: "Projects", tasks: [
          { id: uid(), task: "Shopify store: Create proposal", deadline: "2026-02-13", done: false },
        ],
      },
    ],
  };
}

export default function LifePlanView() {
  const [data, setData] = useState<LifePlanData>(loadData);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => { saveData(data); }, [data]);

  const toggleCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Planning system
  const addPlanningItem = () => {
    setData((d) => ({
      ...d,
      planning: [...d.planning, { id: uid(), name: "", when: "", done: false }],
    }));
  };

  const updatePlanning = (id: string, field: keyof PlanningItem, value: string | boolean) => {
    setData((d) => ({
      ...d,
      planning: d.planning.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  };

  const deletePlanning = (id: string) => {
    setData((d) => ({ ...d, planning: d.planning.filter((p) => p.id !== id) }));
  };

  // Projects
  const addProject = () => {
    if (!newProjectName.trim()) return;
    setData((d) => ({
      ...d,
      projects: [...d.projects, { id: uid(), name: newProjectName.trim(), tasks: [] }],
    }));
    setNewProjectName("");
  };

  const deleteProject = (id: string) => {
    setData((d) => ({ ...d, projects: d.projects.filter((p) => p.id !== id) }));
  };

  const addTask = (projectId: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === projectId
          ? { ...p, tasks: [...p.tasks, { id: uid(), task: "", deadline: "", done: false }] }
          : p
      ),
    }));
  };

  const updateTask = (projectId: string, taskId: string, field: keyof ProjectTask, value: string | boolean) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, [field]: value } : t)) }
          : p
      ),
    }));
  };

  const deleteTask = (projectId: string, taskId: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === projectId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) } : p
      ),
    }));
  };

  const totalTasks = data.projects.reduce((sum, p) => sum + p.tasks.length, 0);
  const doneTasks = data.projects.reduce((sum, p) => sum + p.tasks.filter((t) => t.done).length, 0);

  return (
    <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Life Plan</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {totalTasks} tasks across {data.projects.length} projects · {doneTasks} completed
        </p>
      </div>

      {/* Planning System */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Planning System</h3>
          <button onClick={addPlanningItem} className="text-primary hover:opacity-80 transition-opacity">
            <Plus size={16} />
          </button>
        </div>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_40px_40px] gap-px bg-border text-xs font-mono text-muted-foreground">
            <div className="bg-secondary px-3 py-2">Name</div>
            <div className="bg-secondary px-3 py-2">When</div>
            <div className="bg-secondary px-3 py-2">✓</div>
            <div className="bg-secondary px-3 py-2"></div>
          </div>
          {data.planning.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_1fr_40px_40px] gap-px bg-border">
              <div className="bg-card px-1">
                <input
                  value={item.name}
                  onChange={(e) => updatePlanning(item.id, "name", e.target.value)}
                  className="w-full bg-transparent px-2 py-2 text-sm text-foreground focus:outline-none"
                  placeholder="Activity"
                />
              </div>
              <div className="bg-card px-1">
                <input
                  value={item.when}
                  onChange={(e) => updatePlanning(item.id, "when", e.target.value)}
                  className="w-full bg-transparent px-2 py-2 text-sm text-foreground focus:outline-none"
                  placeholder="When"
                />
              </div>
              <div className="bg-card flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) => updatePlanning(item.id, "done", e.target.checked)}
                  className="accent-primary"
                />
              </div>
              <div className="bg-card flex items-center justify-center">
                <button onClick={() => deletePlanning(item.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Project Planning */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Project Planning</h3>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="New project name..."
            className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => e.key === "Enter" && addProject()}
          />
          <button
            onClick={addProject}
            disabled={!newProjectName.trim()}
            className="bg-primary text-primary-foreground px-3 py-2 rounded text-sm hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {data.projects.map((project) => {
            const isCollapsed = collapsedGroups.has(project.id);
            const done = project.tasks.filter((t) => t.done).length;
            const total = project.tasks.length;
            const progress = total > 0 ? (done / total) * 100 : 0;

            return (
              <div key={project.id} className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Project header */}
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => toggleCollapse(project.id)}
                >
                  {isCollapsed ? <ChevronRight size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  <span className="font-medium text-sm text-foreground flex-1">{project.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{done}/{total}</span>
                  <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden ml-2">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                    className="text-muted-foreground hover:text-destructive ml-2"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Tasks */}
                {!isCollapsed && (
                  <div className="border-t border-border">
                    {project.tasks.map((task) => {
                      const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !task.done;
                      return (
                        <div key={task.id} className="flex items-center gap-2 px-4 py-2 border-b border-border/50 last:border-b-0">
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={(e) => updateTask(project.id, task.id, "done", e.target.checked)}
                            className="accent-primary flex-shrink-0"
                          />
                          <input
                            value={task.task}
                            onChange={(e) => updateTask(project.id, task.id, "task", e.target.value)}
                            className={`flex-1 bg-transparent text-sm focus:outline-none ${
                              task.done ? "line-through text-muted-foreground" : "text-foreground"
                            }`}
                            placeholder="Task description"
                          />
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Calendar size={10} className={isOverdue ? "text-cat-b" : "text-muted-foreground"} />
                            <input
                              type="date"
                              value={task.deadline}
                              onChange={(e) => updateTask(project.id, task.id, "deadline", e.target.value)}
                              className={`bg-transparent text-xs font-mono focus:outline-none w-28 ${
                                isOverdue ? "text-cat-b" : "text-muted-foreground"
                              }`}
                            />
                          </div>
                          <button
                            onClick={() => deleteTask(project.id, task.id)}
                            className="text-muted-foreground hover:text-destructive flex-shrink-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => addTask(project.id)}
                      className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors text-left"
                    >
                      + Add task
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Free-form notes */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notes</h3>
        <textarea
          value={data.notes}
          onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))}
          placeholder="Free-form notes, reflections, vision..."
          rows={6}
          className="w-full bg-card border border-border rounded-lg p-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none scrollbar-thin leading-relaxed"
        />
      </section>
    </div>
  );
}
