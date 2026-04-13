import { useState, useEffect } from "react";
import { ViewMode, Task, Project, Reminder } from "@/lib/types";
import { store } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import TasksView from "@/components/TasksView";
import ProjectsView from "@/components/ProjectsView";
import LifePlanView from "@/components/LifePlanView";
import RemindersView from "@/components/RemindersView";

export default function Index() {
  const [view, setView] = useState<ViewMode>("tasks");
  const [tasks, setTasks] = useState<Task[]>(() => store.getTasks());
  const [projects, setProjects] = useState<Project[]>(() => store.getProjects());
  const [reminders, setReminders] = useState<Reminder[]>(() => store.getReminders());

  useEffect(() => { store.saveTasks(tasks); }, [tasks]);
  useEffect(() => { store.saveProjects(projects); }, [projects]);
  useEffect(() => { store.saveReminders(reminders); }, [reminders]);
  

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar active={view} onChange={setView} taskCount={tasks.filter((t) => !t.completed).length} />
      {view === "tasks" && <TasksView tasks={tasks} projects={projects} onSave={setTasks} />}
      {view === "projects" && <ProjectsView projects={projects} tasks={tasks} onSaveProjects={setProjects} />}
      {view === "lifeplan" && <LifePlanView />}
      {view === "reminders" && <RemindersView reminders={reminders} tasks={tasks} onSave={setReminders} />}
    </div>
  );
}
