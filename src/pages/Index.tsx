import { useState, useEffect, useMemo } from "react";
import { ViewMode, Task, Project, Reminder, LifePlanProject } from "@/lib/types";
import { store } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import TasksView from "@/components/TasksView";
import ProjectsView from "@/components/ProjectsView";
import LifePlanView from "@/components/LifePlanView";
import RemindersView from "@/components/RemindersView";
import AIChat from "@/components/AIChat";

const LIFEPLAN_KEY = "serpent-lifeplan-v2";

function loadLifePlanProjects(): LifePlanProject[] {
  try {
    const raw = localStorage.getItem(LIFEPLAN_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return (data.projects || []).map((p: any) => ({ id: p.id, name: p.name }));
  } catch {
    return [];
  }
}

export default function Index() {
  const [view, setView] = useState<ViewMode>("tasks");
  const [tasks, setTasks] = useState<Task[]>(() => store.getTasks());
  const [projects, setProjects] = useState<Project[]>(() => store.getProjects());
  const [reminders, setReminders] = useState<Reminder[]>(() => store.getReminders());
  const [lifePlanProjects, setLifePlanProjects] = useState<LifePlanProject[]>(loadLifePlanProjects);

  useEffect(() => { store.saveTasks(tasks); }, [tasks]);
  useEffect(() => { store.saveProjects(projects); }, [projects]);
  useEffect(() => { store.saveReminders(reminders); }, [reminders]);

  // Refresh life plan projects when switching views
  useEffect(() => {
    setLifePlanProjects(loadLifePlanProjects());
  }, [view]);

  // Merge regular projects + life plan projects for task form
  const allProjects = useMemo(() => {
    const lpAsProjects: Project[] = lifePlanProjects.map((lp) => ({
      id: `lp-${lp.id}`,
      name: `📋 ${lp.name}`,
      description: "Life Plan project",
      createdAt: "",
    }));
    return [...projects, ...lpAsProjects];
  }, [projects, lifePlanProjects]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar active={view} onChange={setView} taskCount={tasks.filter((t) => !t.completed).length} />
      {view === "tasks" && <TasksView tasks={tasks} projects={allProjects} onSave={setTasks} />}
      {view === "projects" && <ProjectsView projects={projects} tasks={tasks} onSaveProjects={setProjects} lifePlanProjects={lifePlanProjects} />}
      {view === "lifeplan" && <LifePlanView />}
      {view === "reminders" && <RemindersView reminders={reminders} tasks={tasks} onSave={setReminders} />}
      {view === "ai" && <AIChat tasks={tasks} projects={allProjects} onSaveTasks={setTasks} onSaveProjects={setProjects} />}
    </div>
  );
}
