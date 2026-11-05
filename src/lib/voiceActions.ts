import { v4 as uuid } from "uuid";
import { supabase } from "@/integrations/supabase/client";
import { CLOUD_KEYS, cloudGet, cloudGetShared, cloudSet, isPersonalKey } from "@/lib/cloudStore";
import { store } from "@/lib/store";
import { Task, Project, Reminder, CalendarEvent, Category, ALL_CATEGORIES } from "@/lib/types";
import { Habit, todayISO } from "@/lib/habits";
import { JOB_COLLECTIONS, isJobCollection, jobGoalFields, prepareJobRecord } from "@/lib/jobHuntActions";
import { setTaskCompleted } from "./taskCompletion";

export interface VoiceAction {
  type: string;
  [k: string]: any;
}

export interface VoiceCtx {
  userId?: string;
  tasks: Task[];
  projects: Project[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  /** Must be true for any data-changing action to run. */
  approved?: boolean;
}

const COLLECTION_KEYS: Record<string, string> = {
  ...JOB_COLLECTIONS,
  cars: CLOUD_KEYS.cars,
  apartments: CLOUD_KEYS.apartments,
  habits: CLOUD_KEYS.habits,
  weeklyStructure: CLOUD_KEYS.weeklyStructure,
  calendarEvents: CLOUD_KEYS.calendarEvents,
  reminders: CLOUD_KEYS.reminders,
  dailySchedule: CLOUD_KEYS.dailySchedule,
};

function norm(s?: string) {
  return (s ?? "").trim().toLowerCase();
}

function matches(item: any, match: any) {
  if (!match) return false;
  if (match.id) return String(item.id) === String(match.id);
  if (match.title && norm(item.title) === norm(match.title)) return true;
  if (match.name && norm(item.name) === norm(match.name)) return true;
  if (match.title && norm(item.title).includes(norm(match.title))) return true;
  if (match.name && norm(item.name).includes(norm(match.name))) return true;
  return false;
}

async function readCollection<T>(key: string, userId?: string): Promise<T[]> {
  if (!userId) return [];
  const v = isPersonalKey(key)
    ? await cloudGet<T[]>(userId, key, [])
    : await cloudGetShared<T[]>(key, []);
  return Array.isArray(v) ? v : [];
}

async function writeCollection<T>(key: string, value: T[], userId?: string) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  if (userId) await cloudSet(userId, key, value);
  window.dispatchEvent(new StorageEvent("storage", { key }));
  window.dispatchEvent(new CustomEvent("serpent-data-updated", { detail: { key } }));
}

function sanitizeCategories(cats: any): Category[] {
  const arr = Array.isArray(cats) ? cats : [];
  const valid = arr.filter((c) => ALL_CATEGORIES.includes(c as Category)) as Category[];
  return valid.length ? valid : (["A3"] as Category[]);
}

async function createResearchNote(title: string, body: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("research_notes")
    .insert({ title, created_by: user?.id ?? null })
    .select()
    .single();
  if (!data) return null;
  const lines = (body || "").split(/\n+/).filter(Boolean);
  const blocks = lines.map((line, i) => ({
    note_id: data.id,
    position: i,
    block_type: line.startsWith("# ") ? "heading1" : line.startsWith("## ") ? "heading2" : line.startsWith("- ") ? "bullet" : "text",
    content: line.replace(/^(#+\s|-\s)/, ""),
  }));
  await supabase.from("note_blocks").insert(
    blocks.length ? blocks : [{ note_id: data.id, position: 0, block_type: "text", content: "" }]
  );
  window.dispatchEvent(new CustomEvent("research-updated"));
  return data.id as string;
}

async function createList(name: string, items: string[]) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase.from("task_lists").insert({ name, created_by: user?.id ?? null }).select().single();
  if (!data) return null;
  if (items.length) {
    await supabase.from("list_items").insert(items.map((content, i) => ({ list_id: data.id, position: i, content })));
  }
  window.dispatchEvent(new CustomEvent("lists-updated"));
  return data.id as string;
}

function setPath(obj: any, path: string, value: any) {
  const parts = path.split(".").filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

/**
 * Life Plan is where the app's real projects live (serpent-lifeplan-v2).
 * The legacy `serpent-projects` list is barely surfaced, so voice-created
 * projects must land in the Life Plan to actually be visible.
 */
async function addLifePlanProject(name: string, userId?: string) {
  let data: any = { notes: "", planning: [], projects: [] };
  try {
    const raw = localStorage.getItem(CLOUD_KEYS.lifeplanV2);
    if (raw) data = { ...data, ...JSON.parse(raw) };
  } catch {}
  if (!Array.isArray(data.projects)) data.projects = [];
  const group = { id: uuid(), name, tasks: [] as any[] };
  data.projects = [...data.projects, group];
  try { localStorage.setItem(CLOUD_KEYS.lifeplanV2, JSON.stringify(data)); } catch {}
  if (userId) await cloudSet(userId, CLOUD_KEYS.lifeplanV2, data);
  window.dispatchEvent(new StorageEvent("storage", { key: CLOUD_KEYS.lifeplanV2 }));
  window.dispatchEvent(new Event("lifeplan-updated"));
  return group;
}


/** Actions that only move the user around the app — safe to run without approval. */
const READ_ONLY_ACTIONS = new Set(["navigate"]);

/** True when the action would create, change or delete the user's data. */
export function isMutatingAction(a: VoiceAction): boolean {
  return !READ_ONLY_ACTIONS.has(String(a?.type || ""));
}

/** Plain-language description of a proposed change, so the user knows what they approve. */
export function describeAction(a: VoiceAction): string {
  if (isJobCollection(String(a.collection))) {
    const fields = a.item ?? a.fields ?? {};
    const target = [fields.company, fields.role].filter(Boolean).join(" — ") || fields.name || a.match?.id || "record";
    return `${a.type === "collection_add" ? "Add" : "Update"} ${a.collection}: ${target}${a.fields ? ` (${Object.entries(a.fields).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")})` : ""}`;
  }
  if (a.type === "job_goals_update") return `Update Job Hunt goals: ${JSON.stringify(a.fields)}`;
  const label = a.title || a.name || a.match?.title || a.match?.name || a.id || "";
  const t = String(a.type || "").toLowerCase();
  const pretty = t.replace(/[_.]/g, " ");
  if (t.includes("delete") || t.includes("remove")) return `Delete ${label || "an item"}`;
  if (t.includes("create") || t.includes("add")) return `Create ${label ? `"${label}"` : "a new item"}`;
  if (t.includes("navigate") || t.includes("open")) return `Open ${a.view || a.tab || label || "a section"}`;
  return `${pretty.charAt(0).toUpperCase()}${pretty.slice(1)}${label ? `: ${label}` : ""}`;
}

/**
 * Execute a batch of assistant actions. Returns short human-readable summaries.
 * Anything that changes data is skipped unless the user explicitly approved it
 * (`ctx.approved === true`). Navigation is always allowed.
 */
export async function runVoiceActions(actions: VoiceAction[], ctx: VoiceCtx): Promise<string[]> {
  const done: string[] = [];
  const allowed = ctx.approved === true ? actions : actions.filter((a) => !isMutatingAction(a));

  for (const a of allowed) {
    try {
      switch (a.type) {
        case "job_goals_update": {
          if (!ctx.userId) throw new Error("Sign in to edit Job Hunt");
          const fields = jobGoalFields.parse(a.fields);
          const current = await cloudGetShared<Record<string, any>>(CLOUD_KEYS.jobGoals, { appsPerWeek: 10, networkPerWeek: 5 });
          await writeJobValue(CLOUD_KEYS.jobGoals, { ...current, ...fields }, ctx.userId);
          done.push("Job Hunt goals updated");
          break;
        }
        case "create_task": {
          const t = a.task ?? {};
          const task: Task = {
            id: uuid(),
            title: String(t.title ?? "Untitled task"),
            description: t.description,
            categories: sanitizeCategories(t.categories),
            completed: false,
            createdAt: new Date().toISOString(),
            dueDate: t.dueDate,
            dueTime: t.dueTime,
            projectId: t.projectId,
            duration: typeof t.duration === "number" ? t.duration : undefined,
            recurrence: t.recurrence,
            isBabyRelated: !!t.isBabyRelated,
            makesProud: !!t.makesProud,
            location: t.location,
          };
          ctx.setTasks((prev) => [task, ...prev]);
          done.push(`Task “${task.title}” added`);
          break;
        }
        case "update_task": {
          let hit = "";
          ctx.setTasks((prev) =>
            prev.map((t) => {
              if (!matches(t, a.match)) return t;
              hit = t.title;
              const f = { ...(a.fields ?? {}) };
              if (f.categories) f.categories = sanitizeCategories(f.categories);
              return { ...t, ...f };
            })
          );
          done.push(`Task updated${hit ? `: ${hit}` : ""}`);
          break;
        }
        case "complete_task": {
          ctx.setTasks((prev) =>
            prev.map((t) =>
              matches(t, a.match) ? setTaskCompleted(t, true) : t
            )
          );
          done.push("Task completed");
          break;
        }
        case "delete_task": {
          ctx.setTasks((prev) => prev.filter((t) => !matches(t, a.match)));
          done.push("Task deleted");
          break;
        }
        case "create_project": {
          const name = String(a.name ?? "New project");
          const p: Project = {
            id: uuid(),
            name,
            description: a.description,
            createdAt: new Date().toISOString(),
          };
          // Persist directly (survives regardless of React props) …
          store.saveProjects([...store.getProjects(), p]);
          window.dispatchEvent(new StorageEvent("storage", { key: "serpent-projects" }));
          ctx.setProjects((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
          // … and create it in the Life Plan, where projects are actually shown.
          await addLifePlanProject(name, ctx.userId);
          done.push(`Project “${name}” created`);
          break;
        }

        case "create_reminder": {
          const r = a.reminder ?? {};
          const reminder: Reminder = {
            id: uuid(),
            title: String(r.title ?? "Reminder"),
            datetime: r.datetime ?? new Date(Date.now() + 3600_000).toISOString(),
            recurring: r.recurring,
            completed: false,
          };
          const next = [...store.getReminders(), reminder];
          store.saveReminders(next);
          window.dispatchEvent(new StorageEvent("storage", { key: "serpent-reminders" }));
          done.push(`Reminder “${reminder.title}” set`);
          break;
        }
        case "create_event": {
          const e = a.event ?? {};
          const ev: CalendarEvent = {
            id: uuid(),
            title: String(e.title ?? "Event"),
            description: e.description,
            start: e.start ?? new Date().toISOString(),
            end: e.end ?? new Date(Date.now() + 3600_000).toISOString(),
            allDay: !!e.allDay,
            source: "ai",
          };
          store.saveCalendarEvents([...store.getCalendarEvents(), ev]);
          window.dispatchEvent(new StorageEvent("storage", { key: "serpent-calendar-events" }));
          done.push(`Event “${ev.title}” scheduled`);
          break;
        }
        case "create_note": {
          await createResearchNote(String(a.title ?? "Note"), String(a.body ?? ""));
          done.push(`Note “${a.title}” saved`);
          break;
        }
        case "create_list": {
          await createList(String(a.name ?? "List"), Array.isArray(a.items) ? a.items.map(String) : []);
          done.push(`List “${a.name}” created`);
          break;
        }
        case "create_habit": {
          const h = a.habit ?? {};
          const habit: Habit = {
            id: uuid(),
            name: String(h.name ?? "Habit"),
            frequency: h.frequency ?? "daily",
            weekdays: h.weekdays,
            weeklyDay: h.weeklyDay,
            cycleStart: todayISO(),
            times: Array.isArray(h.times) ? h.times.map(String) : [],
            notes: h.notes,
            createdAt: new Date().toISOString(),
            log: {},
            pushedToTasks: !!h.pushedToTasks,
          };
          const list = await readCollection<Habit>(CLOUD_KEYS.habits, ctx.userId);
          await writeCollection(CLOUD_KEYS.habits, [...list, habit], ctx.userId);
          done.push(`Habit “${habit.name}” created`);
          break;
        }
        case "log_habit": {
          const list = await readCollection<Habit>(CLOUD_KEYS.habits, ctx.userId);
          const day = todayISO();
          const next = list.map((h) => {
            if (!matches(h, a.match)) return h;
            const slot = a.slot ?? (h.times?.[0] ?? "any");
            const cur = h.log?.[day] ?? [];
            return cur.includes(slot) ? h : { ...h, log: { ...h.log, [day]: [...cur, slot] } };
          });
          await writeCollection(CLOUD_KEYS.habits, next, ctx.userId);
          done.push("Habit logged");
          break;
        }
        case "collection_add": {
          const key = COLLECTION_KEYS[a.collection];
          if (!key) break;
          const list = await readCollection<any>(key, ctx.userId);
          if (isJobCollection(a.collection)) {
            if (!ctx.userId) throw new Error("Sign in to edit Job Hunt");
            const item = prepareJobRecord(a.collection, a.item ?? {}, undefined, uuid());
            await writeJobValue(key, [...list, item], ctx.userId);
            done.push(`Added to ${a.collection}: ${item.company || item.name || item.round || "Interview"}`);
            break;
          }
          const item = { id: uuid(), ...(a.item ?? {}) };
          await writeCollection(key, [...list, item], ctx.userId);
          done.push(`Added to ${a.collection}`);
          break;
        }
        case "collection_update": {
          const key = COLLECTION_KEYS[a.collection];
          if (!key) break;
          const list = await readCollection<any>(key, ctx.userId);
          if (isJobCollection(a.collection)) {
            if (!ctx.userId) throw new Error("Sign in to edit Job Hunt");
            const hits = list.filter((item) => matches(item, a.match));
            if (hits.length !== 1) throw new Error("Choose exactly one Job Hunt record by its ID");
            const next = prepareJobRecord(a.collection, a.fields ?? {}, hits[0]);
            await writeJobValue(key, list.map((item) => item.id === next.id ? next : item), ctx.userId);
            done.push(`Updated ${a.collection}: ${next.company || next.name || next.round || "Interview"}`);
            break;
          }
          await writeCollection(
            key,
            list.map((i) => (matches(i, a.match) ? { ...i, ...(a.fields ?? {}) } : i)),
            ctx.userId
          );
          done.push(`Updated ${a.collection}`);
          break;
        }
        case "collection_delete": {
          const key = COLLECTION_KEYS[a.collection];
          if (!key) break;
          const list = await readCollection<any>(key, ctx.userId);
          await writeCollection(key, list.filter((i) => !matches(i, a.match)), ctx.userId);
          done.push(`Removed from ${a.collection}`);
          break;
        }
        case "baby_patch": {
          if (!ctx.userId) break;
          const cur = (await cloudGetShared<any>(CLOUD_KEYS.baby, {})) ?? {};
          const next = setPath({ ...cur }, String(a.path ?? ""), a.value);
          try { localStorage.setItem(CLOUD_KEYS.baby, JSON.stringify(next)); } catch {}
          await cloudSet(ctx.userId, CLOUD_KEYS.baby, next);
          window.dispatchEvent(new StorageEvent("storage", { key: CLOUD_KEYS.baby }));
          done.push("Baby module updated");
          break;
        }
        case "navigate": {
          const v = String(a.view ?? "").toLowerCase();
          if (["ai", "chat", "organizer", "organization", "organization chat", "life organizer"].includes(v)) {
            window.dispatchEvent(new CustomEvent("serpent-open-organizer"));
            done.push("Opened Organization chat");
          } else {
            window.dispatchEvent(new CustomEvent("serpent-navigate", { detail: a.view }));
            done.push(`Opened ${a.view}`);
          }
          break;
        }
        default:
          break;
      }
    } catch (e) {
      console.error("[voice] action failed", a, e);
      done.push(`Failed: ${a.type}${e instanceof Error ? ` — ${e.message}` : ""}`);
    }
  }

  return done;
}

/** Compact snapshot of app state for the assistant. */
export async function buildVoiceState(ctx: VoiceCtx) {
  const [applications, contacts, interviews, companies, resumes, goals] = await Promise.all([
    readCollection<any>(CLOUD_KEYS.jobs, ctx.userId), readCollection<any>(CLOUD_KEYS.jobContacts, ctx.userId),
    readCollection<any>(CLOUD_KEYS.jobInterviews, ctx.userId), readCollection<any>(CLOUD_KEYS.jobCompanies, ctx.userId),
    readCollection<any>(CLOUD_KEYS.jobResumes, ctx.userId),
    ctx.userId ? cloudGetShared(CLOUD_KEYS.jobGoals, { appsPerWeek: 10, networkPerWeek: 5 }) : Promise.resolve(null),
  ]);
  const habits = await readCollection<Habit>(CLOUD_KEYS.habits, ctx.userId);
  const cars = await readCollection<any>(CLOUD_KEYS.cars, ctx.userId);
  const apartments = await readCollection<any>(CLOUD_KEYS.apartments, ctx.userId);
  return {
    jobHunt: { applications, contacts, interviews, companies, resumes, goals },
    today: new Date().toISOString().slice(0, 10),
    now: new Date().toISOString(),
    categories: ALL_CATEGORIES,
    tasks: ctx.tasks.slice(0, 120).map((t) => ({
      id: t.id, title: t.title, completed: t.completed, categories: t.categories,
      dueDate: t.dueDate, dueTime: t.dueTime, projectId: t.projectId,
    })),
    projects: ctx.projects.map((p) => ({ id: p.id, name: p.name })),
    reminders: store.getReminders().slice(0, 40).map((r) => ({ id: r.id, title: r.title, datetime: r.datetime })),
    calendarEvents: store.getCalendarEvents().slice(-40).map((e) => ({ id: e.id, title: e.title, start: e.start })),
    habits: habits.map((h) => ({ id: h.id, name: h.name, frequency: h.frequency, times: h.times })),
    cars: cars.map((c: any) => ({ id: c.id, name: c.name ?? c.make })),
    apartments: apartments.map((x: any) => ({ id: x.id, address: x.address, stage: x.stage, price: x.price })),
  };
}

async function writeJobValue(key: string, value: unknown, userId: string) {
  const { error } = await supabase.from("user_data").upsert(
    { user_id: userId, key, value: value as any, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" }
  );
  if (error) throw error;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Cloud remains authoritative. */ }
  window.dispatchEvent(new StorageEvent("storage", { key }));
  window.dispatchEvent(new CustomEvent("serpent-data-updated", { detail: { key } }));
}
