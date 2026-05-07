export type CategoryA = "A1" | "A2" | "A3";
export type CategoryB = "B1" | "B2";
export type CategorySingle = "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";
export type Category = CategoryA | CategoryB | CategorySingle;

export const ALL_CATEGORIES: Category[] = [
  "A1", "A2", "A3", "B1", "B2", "C", "D", "E", "F", "G", "H", "I", "J", "K",
];

export const CATEGORY_META: Record<Category, { label: string; description: string; color: string }> = {
  A1: { label: "A1 · Today", description: "Must happen today", color: "cat-a" },
  A2: { label: "A2 · This Week", description: "Must be done this week", color: "cat-a" },
  A3: { label: "A3 · No Rush", description: "No time consequence", color: "cat-a" },
  B1: { label: "B1 · Critical", description: "Highest consequence if not done", color: "cat-b" },
  B2: { label: "B2 · Important", description: "Will have consequences if not done", color: "cat-b" },
  C: { label: "C · Quick Win", description: "Very fast and easy, within minutes", color: "cat-c" },
  D: { label: "D · Near geographic location of other tasks", description: "Geographically close together", color: "cat-d" },
  E: { label: "E · Hate It", description: "Things I hate doing", color: "cat-e" },
  F: { label: "F · Despise It", description: "Hate doing, magnitude 1 to ballistic", color: "cat-f" },
  G: { label: "G · Enjoy It", description: "Things I like doing, rewarding", color: "cat-g" },
  H: { label: "H · Proud", description: "Things that make me proud", color: "cat-h" },
  I: { label: "I · Avoid", description: "Don't want to know about or touch", color: "cat-i" },
  J: { label: "J · Long Term", description: "Part of bigger evolving projects", color: "cat-j" },
  K: { label: "K · Non-Negotiable for Célida", description: "Non-negotiable commitments to Célida", color: "cat-k" },
};

export interface Task {
  id: string;
  title: string;
  description?: string;
  categories: Category[];
  completed: boolean;
  createdAt: string;
  completedAt?: string;
  projectId?: string;
  location?: string;
  /** Optional geocoded coordinates for the location (from OSM/Nominatim). */
  locationLat?: number;
  locationLon?: number;
  hateMagnitude?: number;
  duration?: number;
  dueDate?: string;
  /** Specific time of day (HH:MM, 24h) by which this task should be done. Drives the bottom alarm center. */
  dueTime?: string;
  /** Legacy single-assignee. Kept for backwards-compat; prefer `assigneeIds` for multi-assign. */
  assigneeId?: string | null;
  /** Multi-assignee — any household member ids. When present, takes precedence over `assigneeId`. */
  assigneeIds?: string[];
  isPrivate?: boolean;
  // Pride scoring — opt-in flag; longer + proud = more points.
  makesProud?: boolean;
  // Recurrence — daily / weekly auto-resetting tasks.
  recurrence?: "daily" | "weekly";
  // Date (YYYY-MM-DD or ISO week id like 2026-W19) of last completion for recurring tasks.
  lastCompletedPeriod?: string;
  // Optional list to open when starting this task.
  linkedListId?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  taskId?: string;
  title: string;
  datetime: string;
  recurring?: "daily" | "weekly" | "monthly";
  completed: boolean;
}

export type ViewMode = "tasks" | "projects" | "lifeplan" | "reminders" | "research" | "lists" | "calendar" | "ai" | "consistency";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay?: boolean;
  source?: "manual" | "ics" | "ai" | "google" | "schedule";
  googleId?: string;
  isPrivate?: boolean;
}

/**
 * A reusable block in the weekly structure template.
 * `dayOfWeek`: 0 = Sunday … 6 = Saturday.
 * Times are HH:MM (24h, 15-min snapped).
 * `recurring` defaults to true (every week); set false for one-off entries pinned to a date.
 */
export interface WeeklyStructureBlock {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /** Optional task this block represents (drag from palette). */
  taskId?: string;
  /** Snapshot label when no task is linked (e.g. ICS event, "Work shift"). */
  label?: string;
  /** Snapshot of category badges (for visual). */
  taskCategories?: Category[];
  /** Source: manual block, dragged task, ICS import, or weekly recurring task entry. */
  source?: "manual" | "task" | "ics" | "recurring";
  /** Optional colour override (semantic token name or HSL). */
  color?: string;
  /** True = repeats every week. False = pinned to a specific ISO date (`pinnedDate`). */
  recurring?: boolean;
  pinnedDate?: string; // YYYY-MM-DD
  /** ICS source URL (if from a subscription) so we can refresh. */
  icsUrl?: string;
}

export interface DailyScheduleSlot {
  id: string;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  taskId?: string;
  label?: string;
  taskCategories?: Category[]; // snapshot for visual badges
  alarmFired?: boolean; // overdue alarm tracking
}

export interface LifePlanProject {
  id: string;
  name: string;
}

// Legacy local note type — still used by old store; new system uses Cloud-backed ResearchNoteRow.
export interface ResearchNote {
  id: string;
  projectId?: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Cloud-backed Research (Notion-style) =====
export type BlockType =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "checklist"
  | "bullet"
  | "image"
  | "file"
  | "divider"
  | "quote"
  | "code";

export interface ResearchNoteRow {
  id: string;
  title: string;
  icon?: string | null;
  project_id?: string | null;
  created_at: string;
  updated_at: string;
  assignee_id?: string | null;
  created_by?: string | null;
  is_private?: boolean;
}

export interface NoteBlock {
  id: string;
  note_id: string;
  position: number;
  block_type: BlockType;
  content: string | null;
  checked: boolean | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  created_at: string;
}

// ===== Lists =====
export interface TaskList {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  project_id?: string | null;
  created_at: string;
  updated_at: string;
  assignee_id?: string | null;
  created_by?: string | null;
  is_private?: boolean;
}

export interface ListItem {
  id: string;
  list_id: string;
  position: number;
  content: string;
  checked: boolean;
  linked_task_id?: string | null;
  created_at: string;
}
