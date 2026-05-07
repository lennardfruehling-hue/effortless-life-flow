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
  const [tasks, setTasks] = useCloudState<Task[]>(CLOUD_KEYS.tasks, []);
  const [projects, setProjects] = useState<Project[]>(() => store.getProjects());
  const [reminders, setReminders] = useState<Reminder[]>(() => store.getReminders());
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => store.getCalendarEvents());
  const [dailySchedule, setDailySchedule] = useState<DailyScheduleSlot[]>(() => store.getDailySchedule());
  const [lifePlanProjects, setLifePlanProjects] = useState<LifePlanProject[]>(loadLifePlanProjects);
  const [taskFilterProject, setTaskFilterProject] = useState<string | undefined>();
  const [weeklyStructure, setWeeklyStructure] = useCloudState<WeeklyStructureBlock[]>(CLOUD_KEYS.weeklyStructure, []);

  // Tasks are stored per-user (PERSONAL_KEYS). When a task is assigned to other
  // members, we duplicate it into their personal task list (one-time copy).
  const myId = user?.id;

  // Track which assignment-duplications we've already pushed so editing a task doesn't
  // re-duplicate every save.
  const dispatchedAssignments = useRef<Set<string>>(new Set());

  const setVisibleTasks: React.Dispatch<React.SetStateAction<Task[]>> = (updater) => {
    setTasks((prev) => {
      const nextRaw = typeof updater === "function" ? (updater as (p: Task[]) => Task[])(prev) : updater;
      const stamped = nextRaw.map((t) => (t.createdBy || !myId ? t : { ...t, createdBy: myId }));

      // Detect newly-assigned-to-others (not me) and duplicate to their personal cloud key.
      if (myId) {
        for (const t of stamped) {
          const ids = (t.assigneeIds && t.assigneeIds.length > 0)
            ? t.assigneeIds
            : (t.assigneeId ? [t.assigneeId] : []);
          for (const targetId of ids) {
            if (!targetId || targetId === myId) continue;
            const dispatchKey = `${t.id}::${targetId}`;
            if (dispatchedAssignments.current.has(dispatchKey)) continue;
            dispatchedAssignments.current.add(dispatchKey);
            // Create a fresh copy owned by the assignee; preserve link via id reuse not desired.
            const copy: Task = {
              ...t,
              id: `${t.id}-${targetId.slice(0, 8)}`,
              createdBy: targetId,
              assigneeId: targetId,
              assigneeIds: [targetId],
            };
            // Fire-and-forget; will appear on their next sync.
            cloudAppendForUser(targetId, CLOUD_KEYS.tasks, [copy]).catch((e) =>
              console.warn("[assign] failed to copy task to assignee", e)
            );
          }
        }
      }
      return stamped;
    });
  };
  const visibleTasks = tasks;

  // tasks persist via useCloudState (per-user cloud row)
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
