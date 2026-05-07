import { useState, useEffect, useMemo } from "react";
import { ViewMode, Task, Project, Reminder, LifePlanProject, CalendarEvent, DailyScheduleSlot } from "@/lib/types";
import { store } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import TasksView from "@/components/TasksView";
import LifePlanView from "@/components/LifePlanView";
import RemindersView from "@/components/RemindersView";
import ResearchTabs from "@/components/ResearchTabs";
import ListsView from "@/components/ListsView";
import CalendarView from "@/components/CalendarView";
import AIChat from "@/components/AIChat";
import AISidebar from "@/components/AISidebar";
import ConsistencyView from "@/components/ConsistencyView";
import ReminderWatcher from "@/components/ReminderWatcher";
import SyncStatusBanner from "@/components/SyncStatusBanner";
import SerpentFlow from "@/components/SerpentFlow";

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
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => store.getCalendarEvents());
  const [dailySchedule, setDailySchedule] = useState<DailyScheduleSlot[]>(() => store.getDailySchedule());
  const [lifePlanProjects, setLifePlanProjects] = useState<LifePlanProject[]>(loadLifePlanProjects);
  const [taskFilterProject, setTaskFilterProject] = useState<string | undefined>();

  useEffect(() => { store.saveTasks(tasks); }, [tasks]);
  useEffect(() => { store.saveProjects(projects); }, [projects]);
  useEffect(() => { store.saveReminders(reminders); }, [reminders]);
  useEffect(() => { store.saveCalendarEvents(calendarEvents); }, [calendarEvents]);
  useEffect(() => { store.saveDailySchedule(dailySchedule); }, [dailySchedule]);

  useEffect(() => {
    setLifePlanProjects(loadLifePlanProjects());
  }, [view]);

  // Cross-device realtime sync: refresh local state when syncBridge updates localStorage
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      switch (e.key) {
        case "serpent-tasks": setTasks(store.getTasks()); break;
        case "serpent-projects": setProjects(store.getProjects()); break;
        case "serpent-reminders": setReminders(store.getReminders()); break;
        case "serpent-calendar-events": setCalendarEvents(store.getCalendarEvents()); break;
        case "serpent-daily-schedule": setDailySchedule(store.getDailySchedule()); break;
        case "serpent-lifeplan-v2": setLifePlanProjects(loadLifePlanProjects()); break;
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const allProjects = useMemo(() => {
    const lpAsProjects: Project[] = lifePlanProjects.map((lp) => ({
      id: `lp-${lp.id}`,
      name: `📋 ${lp.name}`,
      description: "Life Plan project",
      createdAt: "",
    }));
    return [...projects, ...lpAsProjects];
  }, [projects, lifePlanProjects]);

  const navigateToTasksForProject = (projectId: string) => {
    setTaskFilterProject(projectId);
    setView("tasks");
  };

  return (
    <div className="flex min-h-screen bg-background w-full">
      <Sidebar active={view} onChange={setView} taskCount={tasks.filter((t) => !t.completed).length} tasks={tasks} />
      <div className="flex-1 min-w-0 flex flex-col">
        <SyncStatusBanner />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {view === "tasks" && (
          <TasksView
            tasks={tasks}
            projects={allProjects}
            onSave={setTasks}
            dailySchedule={dailySchedule}
            onSaveDailySchedule={setDailySchedule}
            filterProjectId={taskFilterProject}
            onClearProjectFilter={() => setTaskFilterProject(undefined)}
          />
        )}
        {view === "research" && <ResearchTabs projects={allProjects} />}
        {view === "lists" && <ListsView tasks={tasks} onSaveTasks={setTasks} projects={allProjects} />}
        {view === "lifeplan" && <LifePlanView onNavigateToTasks={navigateToTasksForProject} />}
        {view === "calendar" && <CalendarView events={calendarEvents} onSave={setCalendarEvents} />}
        {view === "reminders" && <RemindersView reminders={reminders} tasks={tasks} onSave={setReminders} />}
        {view === "consistency" && <ConsistencyView tasks={tasks} />}
        {view === "ai" && <AIChat tasks={tasks} projects={allProjects} onSaveTasks={setTasks} onSaveProjects={setProjects} />}
      </main>
      </div>
      <AISidebar tasks={tasks} projects={allProjects} onSaveTasks={setTasks} onSaveProjects={setProjects} />
      <ReminderWatcher reminders={reminders} onUpdate={setReminders} />
      <SerpentFlow />
    </div>
  );
}
