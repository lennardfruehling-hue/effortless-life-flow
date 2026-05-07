export type CategoryA = "A1" | "A2" | "A3";
export type CategoryB = "B1" | "B2";
export type CategorySingle = "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";
export type Category = CategoryA | CategoryB | CategorySingle;

export const ALL_CATEGORIES: Category[] = [
  "A1", "A2", "A3", "B1", "B2", "C", "D", "E", "F", "G", "H", "I", "J",
];

export const CATEGORY_META: Record<Category, { label: string; description: string; color: string }> = {
  A1: { label: "A1 · Today", description: "Must happen today", color: "cat-a" },
  A2: { label: "A2 · This Week", description: "Must be done this week", color: "cat-a" },
  A3: { label: "A3 · No Rush", description: "No time consequence", color: "cat-a" },
  B1: { label: "B1 · Critical", description: "Highest consequence if not done", color: "cat-b" },
  B2: { label: "B2 · Important", description: "Will have consequences if not done", color: "cat-b" },
  C: { label: "C · Quick Win", description: "Very fast and easy, within minutes", color: "cat-c" },
  D: { label: "D · Nearby", description: "Geographically close together", color: "cat-d" },
  E: { label: "E · Hate It", description: "Things I hate doing", color: "cat-e" },
  F: { label: "F · Despise It", description: "Hate doing, magnitude 1 to ballistic", color: "cat-f" },
  G: { label: "G · Enjoy It", description: "Things I like doing, rewarding", color: "cat-g" },
  H: { label: "H · Proud", description: "Things that make me proud", color: "cat-h" },
  I: { label: "I · Avoid", description: "Don't want to know about or touch", color: "cat-i" },
  J: { label: "J · Long Term", description: "Part of bigger evolving projects", color: "cat-j" },
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
  hateMagnitude?: number;
  duration?: number;
  dueDate?: string;
  assigneeId?: string | null;
  isPrivate?: boolean;
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

export type ViewMode = "tasks" | "projects" | "lifeplan" | "reminders" | "research" | "lists" | "calendar" | "ai";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay?: boolean;
  source?: "manual" | "ics" | "ai" | "google";
  googleId?: string;
  isPrivate?: boolean;
}

export interface DailyScheduleSlot {
  id: string;
  startTime: string;
  endTime: string;
  taskId?: string;
  label?: string;
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
