import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Calendar, ExternalLink } from "lucide-react";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { AssigneeAvatar } from "./AssigneePicker";
import GanttChart from "./GanttChart";

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
  startDate?: string;
  assigneeId?: string | null;
}

interface ProjectGroup {
  id: string;
  name: string;
  tasks: ProjectTask[];
  startDate?: string;
  endDate?: string;
}

interface LifePlanData {
  notes: string;
  planning: PlanningItem[];
  projects: ProjectGroup[];
}

interface LifePlanViewProps {
  onNavigateToTasks?: (projectId: string) => void;
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
        id: uid(), name: "Student VISA / VISA Célida", startDate: "2025-02-01", endDate: "2026-03-01", tasks: [
          { id: uid(), task: "Get Marriage organized", deadline: "2025-02-22", done: false },
          { id: uid(), task: "Ensure translated marriage certificate is legalized properly and accepted in Ireland", deadline: "2026-02-10", done: false },
          { id: uid(), task: "Guide to prepare application beforehand", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Organize extra day", deadline: "2026-02-13", done: false },
        ],
      },
      {
        id: uid(), name: "Spanish – Lennard", startDate: "2026-02-01", endDate: "2026-06-01", tasks: [
          { id: uid(), task: "Practice Spanish on way home from work (min 2x/week)", deadline: "2026-02-20", done: false },
          { id: uid(), task: "Download torrent client + Spanish course", deadline: "2026-02-19", done: false },
          { id: uid(), task: "Build a Spanish curriculum with a full course", deadline: "2026-02-13", done: false },
        ],
      },
      {
        id: uid(), name: "German – Célida", startDate: "2026-02-01", endDate: "2026-06-01", tasks: [
          { id: uid(), task: "Develop project timeline", deadline: "2026-02-12", done: false },
          { id: uid(), task: "Develop next 2 lessons", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Download movies with German subtitles", deadline: "2026-02-15", done: false },
        ],
      },
      {
        id: uid(), name: "Community", startDate: "2026-02-01", endDate: "2026-12-31", tasks: [
          { id: uid(), task: "Find Kizomba class", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Check out Pathfinder", deadline: "2026-02-11", done: false },
          { id: uid(), task: "Browse events", deadline: "2026-02-14", done: false },
          { id: uid(), task: "Invite Brazilian guy over", deadline: "2026-02-16", done: false },
        ],
      },
      {
        id: uid(), name: "Househunt", startDate: "2026-02-01", endDate: "2026-04-30", tasks: [
          { id: uid(), task: "Look for places", deadline: "2026-02-12", done: false },
          { id: uid(), task: "Set up auto reminder", deadline: "2026-02-11", done: false },
          { id: uid(), task: "Talk to Célida about vision", deadline: "2026-02-15", done: false },
          { id: uid(), task: "Give notice", deadline: "2026-02-11", done: false },
          { id: uid(), task: "Create due diligence list", deadline: "2026-02-15", done: false },
        ],
      },
      {
        id: uid(), name: "Family and Baby", startDate: "2026-02-01", endDate: "2027-01-01", tasks: [
          { id: uid(), task: "Think about what the perfect space for a family looks like", deadline: "2026-03-07", done: false },
          { id: uid(), task: "Check out Brazilian woman for babysitter fit", deadline: "2026-02-13", done: false },
        ],
      },
      {
        id: uid(), name: "Legal Marriage", startDate: "2026-02-01", endDate: "2026-04-01", tasks: [
          { id: uid(), task: "Plan details", deadline: "2026-02-15", done: false },
          { id: uid(), task: "Book flights", deadline: "2026-03-01", done: false },
          { id: uid(), task: "Book hotels", deadline: "2026-03-01", done: false },
          { id: uid(), task: "Prepare for travel", deadline: "2026-03-01", done: false },
        ],
      },
      {
        id: uid(), name: "Jobsearch", startDate: "2026-02-01", endDate: "2026-05-01", tasks: [
          { id: uid(), task: "Create presentation", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Create spreadsheet", deadline: "2026-02-13", done: false },
        ],
      },
      {
        id: uid(), name: "Jobsearch Restaurant", startDate: "2026-02-01", endDate: "2026-03-01", tasks: [
          { id: uid(), task: "Print out resume", deadline: "2026-02-13", done: false },
          { id: uid(), task: "Hand in resume", deadline: "2026-02-14", done: false },
        ],
      },
      {
        id: uid(), name: "Projects", startDate: "2026-02-01", endDate: "2026-12-31", tasks: [
          { id: uid(), task: "Shopify store: Create proposal", deadline: "2026-02-13", done: false },
        ],
      },
    ],
  };
}

function GanttBar({ project, globalStart, globalEnd }: { project: ProjectGroup; globalStart: Date; globalEnd: Date }) {
  const totalDays = Math.max(1, (globalEnd.getTime() - globalStart.getTime()) / (1000 * 60 * 60 * 24));
  const projStart = project.startDate ? new Date(project.startDate) : globalStart;
  const projEnd = project.endDate ? new Date(project.endDate) : globalEnd;
  const startOffset = Math.max(0, (projStart.getTime() - globalStart.getTime()) / (1000 * 60 * 60 * 24));
  const duration = Math.max(1, (projEnd.getTime() - projStart.getTime()) / (1000 * 60 * 60 * 24));
  const leftPct = (startOffset / totalDays) * 100;
  const widthPct = Math.min((duration / totalDays) * 100, 100 - leftPct);
  const done = project.tasks.filter(t => t.done).length;
  const total = project.tasks.length;
  const progress = total > 0 ? (done / total) * 100 : 0;
  const todayOffset = (new Date().getTime() - globalStart.getTime()) / (1000 * 60 * 60 * 24);
  const todayPct = (todayOffset / totalDays) * 100;

  return (
    <div className="relative h-7 bg-secondary/50 rounded">
      {/* Today marker */}
      {todayPct >= 0 && todayPct <= 100 && (
        <div className="absolute top-0 bottom-0 w-px bg-destructive/40 z-10" style={{ left: `${todayPct}%` }} />
      )}
      <div
        className="absolute top-1 bottom-1 rounded bg-primary/20 border border-primary/30 overflow-hidden"
        style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: "2px" }}
      >
        <div className="h-full bg-primary/50 rounded transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export default function LifePlanView({ onNavigateToTasks }: LifePlanViewProps) {
  const { members, byId } = useHouseholdMembers();
  const [data, setData] = useState<LifePlanData>(loadData);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => { saveData(data); }, [data]);

  // Reload when external sources (e.g. AI chat) update the Life Plan
  useEffect(() => {
    const reload = () => setData(loadData());
    window.addEventListener("lifeplan-updated", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("lifeplan-updated", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  const toggleCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addPlanningItem = () => {
    setData((d) => ({ ...d, planning: [...d.planning, { id: uid(), name: "", when: "", done: false }] }));
  };

  const updatePlanning = (id: string, field: keyof PlanningItem, value: string | boolean) => {
    setData((d) => ({ ...d, planning: d.planning.map((p) => (p.id === id ? { ...p, [field]: value } : p)) }));
  };

  const deletePlanning = (id: string) => {
    setData((d) => ({ ...d, planning: d.planning.filter((p) => p.id !== id) }));
  };

  const addProject = () => {
    if (!newProjectName.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const threeMonths = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setData((d) => ({
      ...d,
      projects: [...d.projects, { id: uid(), name: newProjectName.trim(), tasks: [], startDate: today, endDate: threeMonths }],
    }));
    setNewProjectName("");
  };

  const deleteProject = (id: string) => {
    setData((d) => ({ ...d, projects: d.projects.filter((p) => p.id !== id) }));
  };

  const updateProjectDates = (id: string, field: "startDate" | "endDate", value: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  };

  const addTask = (projectId: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === projectId ? { ...p, tasks: [...p.tasks, { id: uid(), task: "", deadline: "", done: false }] } : p
      ),
    }));
  };

  const updateTask = (projectId: string, taskId: string, field: keyof ProjectTask, value: string | boolean) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === projectId ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, [field]: value } : t)) } : p
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

  // Global date range for GANTT
  const allDates = data.projects.flatMap(p => [p.startDate, p.endDate, ...p.tasks.map(t => t.deadline)].filter(Boolean)) as string[];
  const globalStart = allDates.length > 0 ? new Date(allDates.sort()[0]) : new Date();
  const globalEndRaw = allDates.length > 0 ? new Date(allDates.sort().reverse()[0]) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const globalEnd = new Date(Math.max(globalEndRaw.getTime(), globalStart.getTime() + 30 * 24 * 60 * 60 * 1000));

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

      {/* GANTT Overview */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Timeline Overview</h3>
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-1">
            <span>{globalStart.toLocaleDateString("en", { month: "short", year: "numeric" })}</span>
            <span className="text-destructive/60">Today</span>
            <span>{globalEnd.toLocaleDateString("en", { month: "short", year: "numeric" })}</span>
          </div>
          {data.projects.map(project => (
            <div key={project.id} className="flex items-center gap-3">
              <span className="text-xs text-foreground truncate w-32 flex-shrink-0">{project.name}</span>
              <div className="flex-1">
                <GanttBar project={project} globalStart={globalStart} globalEnd={globalEnd} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Planning System */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Planning System</h3>
          <button onClick={addPlanningItem} className="text-primary hover:opacity-80 transition-opacity"><Plus size={16} /></button>
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
                <input value={item.name} onChange={(e) => updatePlanning(item.id, "name", e.target.value)} className="w-full bg-transparent px-2 py-2 text-sm text-foreground focus:outline-none" placeholder="Activity" />
              </div>
              <div className="bg-card px-1">
                <input value={item.when} onChange={(e) => updatePlanning(item.id, "when", e.target.value)} className="w-full bg-transparent px-2 py-2 text-sm text-foreground focus:outline-none" placeholder="When" />
              </div>
              <div className="bg-card flex items-center justify-center">
                <input type="checkbox" checked={item.done} onChange={(e) => updatePlanning(item.id, "done", e.target.checked)} className="accent-primary" />
              </div>
              <div className="bg-card flex items-center justify-center">
                <button onClick={() => deletePlanning(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Project Planning */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Projects</h3>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="New project name..."
            className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => e.key === "Enter" && addProject()}
          />
          <button onClick={addProject} disabled={!newProjectName.trim()} className="bg-primary text-primary-foreground px-3 py-2 rounded text-sm hover:opacity-90 disabled:opacity-30 transition-opacity">
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
                <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => toggleCollapse(project.id)}>
                  {isCollapsed ? <ChevronRight size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  <span className="font-medium text-sm text-foreground flex-1">{project.name}</span>
                  {onNavigateToTasks && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigateToTasks(`lp-${project.id}`); }}
                      className="text-primary hover:opacity-80 p-1"
                      title="View linked tasks"
                    >
                      <ExternalLink size={12} />
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground font-mono">{done}/{total}</span>
                  <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden ml-2">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }} className="text-muted-foreground hover:text-destructive ml-2">
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Timeline dates */}
                {!isCollapsed && (
                  <div className="px-4 py-2 border-t border-border/50 bg-secondary/30 flex items-center gap-3">
                    <Calendar size={12} className="text-muted-foreground" />
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] text-muted-foreground">Start:</label>
                      <input type="date" value={project.startDate || ""} onChange={(e) => updateProjectDates(project.id, "startDate", e.target.value)} className="bg-transparent text-xs font-mono text-foreground focus:outline-none" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] text-muted-foreground">End:</label>
                      <input type="date" value={project.endDate || ""} onChange={(e) => updateProjectDates(project.id, "endDate", e.target.value)} className="bg-transparent text-xs font-mono text-foreground focus:outline-none" />
                    </div>
                  </div>
                )}

                {/* Tasks */}
                {!isCollapsed && (
                  <div className="border-t border-border">
                    {project.tasks.map((task) => {
                      const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !task.done;
                      return (
                        <div key={task.id} className="flex items-center gap-2 px-4 py-2 border-b border-border/50 last:border-b-0">
                          <input type="checkbox" checked={task.done} onChange={(e) => updateTask(project.id, task.id, "done", e.target.checked)} className="accent-primary flex-shrink-0" />
                          <input value={task.task} onChange={(e) => updateTask(project.id, task.id, "task", e.target.value)} className={`flex-1 bg-transparent text-sm focus:outline-none ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`} placeholder="Task description" />
                          {members.length > 1 && (
                            <div className="relative flex-shrink-0">
                              <AssigneeAvatar member={byId(task.assigneeId)} />
                              <select
                                value={task.assigneeId || ""}
                                onChange={(e) => updateTask(project.id, task.id, "assigneeId" as any, e.target.value || null as any)}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                title="Assign"
                              >
                                <option value="">Unassigned</option>
                                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || "Member"}</option>)}
                              </select>
                            </div>
                          )}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Calendar size={10} className={isOverdue ? "text-destructive" : "text-muted-foreground"} />
                            <input type="date" value={task.deadline} onChange={(e) => updateTask(project.id, task.id, "deadline", e.target.value)} className={`bg-transparent text-xs font-mono focus:outline-none w-28 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`} />
                          </div>
                          <button onClick={() => deleteTask(project.id, task.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0"><Trash2 size={12} /></button>
                        </div>
                      );
                    })}
                    <button onClick={() => addTask(project.id)} className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-primary hover:bg-secondary/50 transition-colors text-left">+ Add task</button>

                    {project.tasks.length > 0 && (() => {
                      const projStart = project.startDate ? new Date(project.startDate) : globalStart;
                      const projEnd = project.endDate ? new Date(project.endDate) : globalEnd;
                      const ganttTasks = project.tasks.map(t => ({
                        id: t.id,
                        label: t.task || "(untitled)",
                        startDate: t.startDate,
                        endDate: t.deadline || new Date().toISOString().slice(0, 10),
                        done: t.done,
                        assigneeId: t.assigneeId,
                      }));
                      return (
                        <div className="px-4 py-3 border-t border-border/50 bg-secondary/20">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Gantt</div>
                          <GanttChart
                            tasks={ganttTasks}
                            rangeStart={projStart}
                            rangeEnd={projEnd}
                            onChange={(id, patch) => {
                              if (patch.startDate !== undefined) updateTask(project.id, id, "startDate" as any, patch.startDate as any);
                              if (patch.endDate !== undefined) updateTask(project.id, id, "deadline", patch.endDate as any);
                            }}
                            onAssign={(id, assigneeId) => updateTask(project.id, id, "assigneeId" as any, assigneeId as any)}
                          />
                        </div>
                      );
                    })()}
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
