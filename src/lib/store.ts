import { Task, Project, Reminder } from "./types";

const KEYS = {
  tasks: "serpent-tasks",
  projects: "serpent-projects",
  reminders: "serpent-reminders",
  lifeplan: "serpent-lifeplan",
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data));
}

export const store = {
  getTasks: (): Task[] => load(KEYS.tasks, []),
  saveTasks: (t: Task[]) => save(KEYS.tasks, t),

  getProjects: (): Project[] => load(KEYS.projects, []),
  saveProjects: (p: Project[]) => save(KEYS.projects, p),

  getReminders: (): Reminder[] => load(KEYS.reminders, []),
  saveReminders: (r: Reminder[]) => save(KEYS.reminders, r),

  getLifePlan: (): string => load(KEYS.lifeplan, ""),
  saveLifePlan: (text: string) => save(KEYS.lifeplan, text),
};
