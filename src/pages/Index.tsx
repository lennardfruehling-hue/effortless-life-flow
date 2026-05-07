import { useState, useEffect, useMemo, useRef } from "react";
import { ViewMode, Task, Project, Reminder, LifePlanProject, CalendarEvent, DailyScheduleSlot, WeeklyStructureBlock } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS, cloudAppendForUser } from "@/lib/cloudStore";
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
  const { user } = useAuth();
  const [view, setView] = useState<ViewMode>("tasks");
  const [tasks, setTasks] = useState<Task[]>(() => store.getTasks());
  const [projects, setProjects] = useState<Project[]>(() => store.getProjects());
  const [reminders, setReminders] = useState<Reminder[]>(() => store.getReminders());
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => store.getCalendarEvents());
  const [dailySchedule, setDailySchedule] = useState<DailyScheduleSlot[]>(() => store.getDailySchedule());
  const [lifePlanProjects, setLifePlanProjects] = useState<LifePlanProject[]>(loadLifePlanProjects);
  const [taskFilterProject, setTaskFilterProject] = useState<string | undefined>();
  const [weeklyStructure, setWeeklyStructure] = useCloudState<WeeklyStructureBlock[]>(CLOUD_KEYS.weeklyStructure, []);

  // Tasks are stored in a shared household cloud key, but each user only sees:
  //  - tasks they created (createdBy === me)
  //  - tasks assigned to them (assigneeId or assigneeIds includes me)
  //  - legacy tasks with no createdBy (treated as their own to avoid hiding old data)
  const myId = user?.id;
  const isVisible = (t: Task) => {
    if (!myId) return true;
    if (!t.createdBy) return true; // legacy/un-tagged tasks remain visible to everyone in household (back-compat)
    if (t.createdBy === myId) return true;
    if (t.assigneeId === myId) return true;
    if (Array.isArray(t.assigneeIds) && t.assigneeIds.includes(myId)) return true;
    return false;
  };
  const visibleTasks = useMemo(() => tasks.filter(isVisible), [tasks, myId]);

  // Setter that preserves hidden (other-user) tasks in the underlying store.
  const setVisibleTasks: React.Dispatch<React.SetStateAction<Task[]>> = (updater) => {
    setTasks((prev) => {
      const hidden = prev.filter((t) => !isVisible(t));
      const prevVisible = prev.filter(isVisible);
      const nextVisible = typeof updater === "function" ? (updater as (p: Task[]) => Task[])(prevVisible) : updater;
      // Stamp createdBy on any new tasks lacking it
      const stamped = nextVisible.map((t) => (t.createdBy || !myId ? t : { ...t, createdBy: myId }));
      return [...hidden, ...stamped];
    });
  };

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
      <Sidebar active={view} onChange={setView} taskCount={visibleTasks.filter((t) => !t.completed).length} tasks={visibleTasks} />
      <div className="flex-1 min-w-0 flex flex-col">
        <SyncStatusBanner />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {view === "tasks" && (
          <TasksView
            tasks={visibleTasks}
            projects={allProjects}
            onSave={setVisibleTasks as any}
            dailySchedule={dailySchedule}
            onSaveDailySchedule={setDailySchedule}
            filterProjectId={taskFilterProject}
            onClearProjectFilter={() => setTaskFilterProject(undefined)}
          />
        )}
        {view === "research" && <ResearchTabs projects={allProjects} />}
        {view === "lists" && <ListsView tasks={visibleTasks} onSaveTasks={setVisibleTasks} projects={allProjects} />}
        {view === "lifeplan" && <LifePlanView onNavigateToTasks={navigateToTasksForProject} tasks={visibleTasks} onSaveTasks={setVisibleTasks as any} />}
        {view === "calendar" && (
          <CalendarView
            events={calendarEvents}
            onSave={setCalendarEvents}
            tasks={visibleTasks}
            weeklyStructure={weeklyStructure}
            onSaveWeeklyStructure={setWeeklyStructure}
            dailySchedule={dailySchedule}
            onSaveDailySchedule={setDailySchedule}
          />
        )}
        {view === "reminders" && <RemindersView reminders={reminders} tasks={visibleTasks} onSave={setReminders} />}
        {view === "consistency" && <ConsistencyView tasks={visibleTasks} />}
        {view === "ai" && <AIChat tasks={visibleTasks} projects={allProjects} onSaveTasks={setVisibleTasks} onSaveProjects={setProjects} />}
      </main>
      </div>
      <AISidebar tasks={visibleTasks} projects={allProjects} onSaveTasks={setVisibleTasks} onSaveProjects={setProjects} />
      <ReminderWatcher reminders={reminders} onUpdate={setReminders} />
      <SerpentFlow tasks={visibleTasks} reminders={reminders} lifePlanProjects={lifePlanProjects} dailySchedule={dailySchedule} />
    </div>
  );
}
