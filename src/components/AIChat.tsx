import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from "react";
import { Task, Project, Category, ALL_CATEGORIES, CATEGORY_META } from "@/lib/types";
import { store } from "@/lib/store";
import { v4 as uuid } from "uuid";
import { Send, Bot, User, Loader2, Trash2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

interface AIChatProps {
  tasks: Task[];
  projects: Project[];
  onSaveTasks: Dispatch<SetStateAction<Task[]>>;
  onSaveProjects: Dispatch<SetStateAction<Project[]>>;
}

const LIFEPLAN_KEY = "serpent-lifeplan-v2";

function addLifePlanProject(name: string) {
  try {
    const raw = localStorage.getItem(LIFEPLAN_KEY);
    const data = raw ? JSON.parse(raw) : { notes: "", planning: [], projects: [] };
    const id = Math.random().toString(36).slice(2, 10);
    const today = new Date().toISOString().slice(0, 10);
    const threeMonths = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    data.projects = [
      ...(data.projects || []),
      { id, name, tasks: [], startDate: today, endDate: threeMonths },
    ];
    localStorage.setItem(LIFEPLAN_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("lifeplan-updated"));
    return `lp-${id}`;
  } catch (e) {
    console.error("Failed to add life plan project:", e);
    return null;
  }
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

const TASK_COMMAND_REGEX = /(?:add|create|new|save|make|put)\s+(?:(?:a|an|the)[.\s]+)?task\s+(?:called\s+|named\s+)?(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([^.!?\n]+?))(?:\s+(?:to|in|into|on)\s+(?:the\s+|my\s+)?(?:tasks?|list|todo)s?)?(?:[.!?]|$)/i;
const PROJECT_COMMAND_REGEX = /(?:add|create|new|save|make|start|put)\s+(?:a\s+|an\s+|the\s+)?project\s+(?:called\s+|named\s+)?(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([^.!?\n]+?))(?:\s+(?:to|in|into|on)\s+(?:the\s+|my\s+)?(?:projects?|life[- ]?plan|plan))?(?:[.!?]|$)/i;
const NOTE_COMMAND_REGEX = /(?:add|create|new|save|make|write|put)\s+(?:a\s+|an\s+|the\s+)?(?:research\s+)?note\s+(?:called\s+|named\s+|about\s+|on\s+)?(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([^.!?\n]+?))(?:\s+(?:to|in|into)\s+(?:the\s+|my\s+)?(?:notes?|research))?(?:[.!?]|$)/i;
const LIST_COMMAND_REGEX = /(?:add|create|new|save|make|start|build|put)\s+(?:a\s+|an\s+|the\s+)?(?:packing\s+|shopping\s+|todo\s+|to-do\s+)?list\s+(?:called\s+|named\s+|for\s+)?(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([^,;:.!?\n]+?))(?:\s+(?:with|having|containing|to|in|into|on)\b|[,;:.!?\n]|$)/i;
const EVENT_COMMAND_REGEX = /(?:add|create|new|schedule|put|book|set)\s+(?:a\s+|an\s+|the\s+)?(?:calendar\s+)?(?:event|entry|item|meeting|appointment|date)\b/i;
const REMINDER_COMMAND_REGEX = /(?:^|\b)(?:(?:add|create|new|set|save|make|put)\s+(?:a\s+|an\s+|the\s+)?reminder\b|remind\s+(?:me|us)\b)/i;
const REMINDER_TITLE_REGEX = /(?:remind\s+(?:me|us)\s+to\s+|reminder\s+(?:to|for|about|called|named|titled)\s+)(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([^"\n]+?))(?:\s+(?:at|on|tomorrow|today|next|every|in)\b|[.!?\n]|$)/i;
const EVENT_TITLE_REGEX = /(?:called|named|titled|for)\s+(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([A-Z][^.!?\n,;:]{0,60}))/;
const CATEGORY_CODE_REGEX = /\b(A1|A2|A3|B1|B2|C|D|E|F|G|H|I|J)\b(?=\s*:|\b)/g;
const LIFE_PLAN_PROJECT_REGEX = /\b(lp-[a-z0-9]+)\b/i;

function extractTaskTitle(input: string) {
  const match = input.trim().match(TASK_COMMAND_REGEX);
  return match ? (match[1] || match[2] || "").trim() : "";
}

function extractProjectName(input: string) {
  const match = input.trim().match(PROJECT_COMMAND_REGEX);
  return match ? (match[1] || match[2] || "").trim() : "";
}

function extractNoteTopic(input: string) {
  const match = input.trim().match(NOTE_COMMAND_REGEX);
  return match ? (match[1] || match[2] || "").trim() : "";
}

/** Loose intent detector — true for short confirmations like "save it as a note",
 * "add as a note", "pin it", "file this as a note", "yes, save and pin", etc. */
const NOTE_INTENT_REGEX = /\b(save|add|pin|file|store|keep|put|make)\b[^.\n]{0,40}\b(note|notes|checklist|research)\b/i;
const PIN_INTENT_REGEX = /\b(pin|file|save and pin|save & pin)\b[^.\n]{0,30}\b(it|this|that|under|here|to|in)\b/i;
const AFFIRMATION_REGEX = /^\s*(yes|yep|yeah|sure|please do|ok|okay|do it|go ahead|sounds good|👍|y)\b/i;

function hasNoteIntent(input: string) {
  return NOTE_INTENT_REGEX.test(input) || PIN_INTENT_REGEX.test(input);
}

/** Try to pull a sensible title from a chunk of markdown / text. */
function deriveTitleFromContent(text: string): string {
  if (!text) return "";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  // First markdown heading
  const heading = lines.find(l => /^#{1,3}\s+/.test(l));
  if (heading) return heading.replace(/^#{1,3}\s+/, "").replace(/\*\*/g, "").trim().slice(0, 120);
  // First bold line "**Title**"
  const bold = lines.find(l => /^\*\*[^*]+\*\*/.test(l));
  if (bold) return bold.replace(/\*\*/g, "").replace(/[:.]+$/, "").trim().slice(0, 120);
  // First short non-bullet line that looks title-ish
  const titleish = lines.find(l => l.length <= 80 && !/^([-*•]|\d+[.)])\s+/.test(l) && /[A-Za-z]/.test(l));
  return (titleish || "Saved Note").slice(0, 120);
}

function extractListName(input: string) {
  const match = input.trim().match(LIST_COMMAND_REGEX);
  if (match) return (match[1] || match[2] || "").trim();
  // Fallback: any "list" mention + quoted name (e.g. save in "Lists", under collection "X")
  if (/\blists?\b/i.test(input)) {
    const q = input.match(/["\u201C\u201D']([^"\u201C\u201D'\n]{1,60})["\u201C\u201D']/);
    if (q) return q[1].trim();
  }
  return "";
}

function extractListItemsFromUser(input: string, listName: string): string[] {
  // Strip quoted segments (likely the list name itself) before scanning lines
  const stripped = input.replace(/["\u201C\u201D']([^"\u201C\u201D'\n]{1,60})["\u201C\u201D']/g, " ");
  const skipPattern = /^(save|add|create|new|make|put|start|build|try|again|ry|the|a|an|with|entries?|following|in|to|on|into|for|list|lists)\b/i;
  return stripped
    .split(/\n+/)
    .map(l => l.trim().replace(/^([-*•]|\d+[.)])\s+/, "").replace(/[,;:.]+$/, "").trim())
    .filter(l => l.length > 0 && l.length <= 120 && !skipPattern.test(l) && l.toLowerCase() !== listName.toLowerCase());
}

async function createResearchNote(title: string, body: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("research_notes")
    .insert({ title, created_by: user?.id ?? null })
    .select().single();
  if (!data) return null;
  const blocks = body
    .split(/\n+/)
    .filter(Boolean)
    .map((line, i) => ({
      note_id: data.id,
      position: i,
      block_type: line.startsWith("# ") ? "heading1" : line.startsWith("## ") ? "heading2" : line.startsWith("- ") ? "bullet" : "text",
      content: line.replace(/^(#+\s|-\s)/, ""),
    }));
  if (blocks.length > 0) {
    await supabase.from("note_blocks").insert(blocks);
  } else {
    await supabase.from("note_blocks").insert({ note_id: data.id, position: 0, block_type: "text", content: "" });
  }
  window.dispatchEvent(new CustomEvent("research-updated"));
  return data.id as string;
}

async function createListWithItems(name: string, items: string[]) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase.from("task_lists").insert({ name, created_by: user?.id ?? null }).select().single();
  if (!data) return null;
  if (items.length > 0) {
    await supabase.from("list_items").insert(
      items.map((content, i) => ({ list_id: data.id, position: i, content }))
    );
  }
  window.dispatchEvent(new CustomEvent("lists-updated"));
  return data.id as string;
}

// ===== Calendar event parsing =====
const MONTHS_MAP: Record<string, number> = {
  jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,
  jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11,
};

function parseEventDateTime(input: string, ref = new Date()): { start: string; end: string; allDay: boolean } | null {
  const lower = input.toLowerCase();
  let date: Date | null = null;

  // today / tomorrow
  if (/\btoday\b/.test(lower)) date = new Date(ref);
  else if (/\btomorrow\b/.test(lower)) { date = new Date(ref); date.setDate(date.getDate() + 1); }

  // ISO date YYYY-MM-DD
  if (!date) {
    const iso = lower.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) date = new Date(+iso[1], +iso[2]-1, +iso[3]);
  }

  // "Month D" or "D Month" optionally with year
  if (!date) {
    const md = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:[,\s]+(\d{4}))?/);
    if (md) {
      const m = MONTHS_MAP[md[1]];
      const d = +md[2];
      const y = md[3] ? +md[3] : ref.getFullYear();
      date = new Date(y, m, d);
    }
  }
  if (!date) {
    const dm = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:[,\s]+(\d{4}))?/);
    if (dm) {
      const d = +dm[1];
      const m = MONTHS_MAP[dm[2]];
      const y = dm[3] ? +dm[3] : ref.getFullYear();
      date = new Date(y, m, d);
    }
  }

  // weekday — next occurrence
  if (!date) {
    const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    for (let i = 0; i < days.length; i++) {
      if (new RegExp(`\\b${days[i]}\\b`).test(lower)) {
        date = new Date(ref);
        const diff = (i - date.getDay() + 7) % 7 || 7;
        date.setDate(date.getDate() + diff);
        break;
      }
    }
  }

  if (!date) return null;

  // time: "at 3pm", "at 14:30", "at 3:30 pm"
  const tm = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) || lower.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  let allDay = true;
  if (tm) {
    let h = +tm[1];
    const min = tm[2] ? +tm[2] : 0;
    const ampm = tm[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    date.setHours(h, min, 0, 0);
    allDay = false;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmtDate = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  if (allDay) return { start: `${fmtDate}T00:00`, end: `${fmtDate}T23:59`, allDay: true };
  const startStr = `${fmtDate}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const end = new Date(date); end.setHours(end.getHours() + 1);
  const endStr = `${fmtDate}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
  return { start: startStr, end: endStr, allDay: false };
}

function extractEventTitle(input: string) {
  if (!EVENT_COMMAND_REGEX.test(input)) return "";
  const q = input.match(/["\u201C\u201D'](.+?)["\u201C\u201D']/);
  if (q) return q[1].trim();
  const m = input.match(EVENT_TITLE_REGEX);
  if (m) return (m[1] || m[2] || "").trim();
  // fallback: last capitalized word group, or generic title
  return "Event";
}

function extractReminderTitle(input: string) {
  if (!REMINDER_COMMAND_REGEX.test(input)) return "";
  const m = input.match(REMINDER_TITLE_REGEX);
  if (m) return (m[1] || m[2] || "").trim().replace(/[.!?,;:]+$/, "");
  const q = input.match(/["\u201C\u201D'](.+?)["\u201C\u201D']/);
  if (q) return q[1].trim();
  return "Reminder";
}

function addReminderEntry(title: string, dt: { start: string; end: string; allDay: boolean }, recurring?: "daily" | "weekly" | "monthly") {
  try {
    const KEY = "serpent-reminders";
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const datetime = dt.allDay ? `${dt.start.slice(0, 10)}T09:00` : dt.start;
    const rem = { id: uuid(), title, datetime, recurring, completed: false };
    arr.push(rem);
    localStorage.setItem(KEY, JSON.stringify(arr));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    return rem.id;
  } catch (e) {
    console.error("Failed to add reminder:", e);
    return null;
  }
}

function extractRecurring(input: string): "daily" | "weekly" | "monthly" | undefined {
  const l = input.toLowerCase();
  if (/\b(every\s+day|daily|each\s+day)\b/.test(l)) return "daily";
  if (/\b(every\s+week|weekly|each\s+week)\b/.test(l)) return "weekly";
  if (/\b(every\s+month|monthly|each\s+month)\b/.test(l)) return "monthly";
  return undefined;
}
  try {
    const KEY = "serpent-calendar-events";
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const ev = {
      id: uuid(),
      title,
      start: dt.start,
      end: dt.end,
      allDay: dt.allDay,
      source: "ai",
    };
    arr.push(ev);
    localStorage.setItem(KEY, JSON.stringify(arr));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    return ev.id;
  } catch (e) {
    console.error("Failed to add calendar event:", e);
    return null;
  }
}

// Pull a bullet-list out of an AI response, if any
function extractBullets(text: string): string[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const bulleted = lines
    .filter(l => /^([-*•]|\d+[.)])\s+/.test(l))
    .map(l => l.replace(/^([-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
  if (bulleted.length > 0) return bulleted;
  // Inline numbered like "1) Test 2) Test B 3) Test 3"
  const inline = Array.from(text.matchAll(/\d+[.)]\s*([^0-9\n][^\n]*?)(?=\s+\d+[.)]\s|$)/g))
    .map(m => m[1].trim().replace(/[,;.]+$/, ""))
    .filter(Boolean);
  return inline;
}

function extractCategories(content: string): Category[] {
  const matches = content.match(CATEGORY_CODE_REGEX) || [];
  return Array.from(new Set(matches)).filter(
    (category): category is Category => ALL_CATEGORIES.includes(category as Category)
  );
}

function extractProjectId(content: string, projects: Project[]) {
  const match = content.match(LIFE_PLAN_PROJECT_REGEX)?.[1];
  return match && projects.some((project) => project.id === match) ? match : undefined;
}

function getTextContent(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.filter(c => c.type === "text").map(c => c.text || "").join("");
}

function buildSystemPrompt(tasks: Task[], projects: Project[]): string {
  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const categoryDescriptions = ALL_CATEGORIES.map(
    (cat) => `${cat}: ${CATEGORY_META[cat].label} - ${CATEGORY_META[cat].description}`
  ).join("\n");

  const taskList = activeTasks.map((t) =>
    `- [${t.id.slice(0, 8)}] "${t.title}" (categories: ${t.categories.join(", ")}${t.projectId ? `, project: ${t.projectId}` : ""}${t.duration ? `, duration: ${t.duration}min` : ""})`
  ).join("\n");

  const projectList = projects.map((p) => `- [${p.id.slice(0, 8)}] "${p.name}"${p.description ? ` - ${p.description}` : ""}`).join("\n");

  return `You are the Serpent List AI assistant. You help manage tasks, projects, and life planning.
You have MEMORY of all previous conversations. Use this context to give better, personalized advice.
You can analyze images sent to you via OCR - describe what you see and extract text/data from images.

## Core Organizational Principles (ALWAYS APPLY)
You operate by these principles for every suggestion, save, and amendment. If a user request violates them, gently suggest an amendment.

The Basics
- Know why it's there. Things live where they are used.
- Keep it simple. One home per category — not ten.
- Do it the same way every time. Consistent placement, naming, tagging.
- Make it obvious. If it needs explaining, it's in the wrong place.

Where Things Go
- Everything has ONE home. No duplicates across lists/notes/projects.
- Keep similar things together (batteries with batteries).
- Don't nest too deep. Shallow beats clever.

Easy to Use
- Most-used items are easiest to reach (top of list, pinned, front of project).
- No thinking required to find something.
- Putting things away must be effortless — capture must beat dropping it.
- Anyone in the household should understand the structure without asking.

Being Smart About It
- Think ahead — leave room to grow.
- Know what matters most. Critical info findable in 30 seconds; archival can be slower.

Keeping It Honest
- One source of truth. Never two versions of the same list/note.
- Trust the system completely — no shadow notes, no double-checking.

When Things Go Wrong
- Mistakes must be easy to fix (rename, move, undo).
- One mess shouldn't cascade — isolate failures.

Growing and Changing
- Structures must scale from 20 to 200 items.
- Periodic clean-out is part of the system.

People Stuff
- Work with the user's brain, not against it.
- Make the right thing the easy thing.
- Mistakes shouldn't be catastrophic.

The Big Idea: organization makes life easier without thinking. The best system is the one you forget is there.

## Life Plan Hierarchy
There is a nested hierarchy you must respect:
- **Direction** — the 6-year vision (e.g. "house by the beach and community in Mexico"). Everything ladders up to this.
- **Life Plan Projects** — multi-month efforts that move toward the Direction.
- **Subprojects** — concrete chunks within a project.
- **Tasks** — single actionable steps within subprojects.
When saving, categorising, or suggesting work, always place items at the correct level and link them upward to the Direction when possible.

## Saving & Remembering
Anything you save (notes, lists, tasks, projects) must be categorised and placed according to the principles above:
- Pick the ONE correct home. Don't duplicate.
- Use consistent names and tags.
- Place under the right Life Plan Project / Subproject when applicable.
- Keep it shallow and obvious.
- If the user's request would violate a principle, suggest a cleaner amendment before saving.

## Serpent List Categories
${categoryDescriptions}

## Current Active Tasks (${activeTasks.length})
${taskList || "No active tasks"}

## Completed Tasks: ${completedTasks.length}

## Projects
${projectList || "No projects"}

## Your Capabilities
1. Create new tasks - suggest categories, help prioritize
2. Create new projects - organize long-term work
3. Edit existing tasks - change categories, titles, descriptions
4. Plan their day - recommend which tasks to do based on the Serpent system
5. Manage projects - suggest new projects or organize existing ones
6. Life planning advice - based on the Serpent prioritization system AND the Direction vision
7. **Analyze images** - OCR, extract text, read documents, interpret screenshots
8. **Save research notes** - when user says "save a note about X" or "write a note on X", produce a markdown body (use # for headings, - for bullets) that will become a Notion-style note
9. **Build lists** - when user says "make a packing list for Tokyo", reply with a clear bulleted list (one item per line starting with "-"); items will be saved automatically
10. **Add calendar entries** - when user says "add a calendar entry/event/item today at 7:30pm called 'Datenight'", the app saves it directly to the in-app calendar. Confirm naturally — DO NOT tell the user you can't, and DO NOT offer Google Calendar links or .ics files. Just confirm what was added (title + date/time).

## Serpent System Rules
- A1 tasks are done FIRST (today, urgent)
- Then pick tasks with the MOST categories (highest overlap = highest priority)
- D tasks close geographically should be batched together
- On bad days: do A1+B1 only, then G+H (things you enjoy/feel proud of)
- On hate days: batch all E+F tasks and clear them out
- Every new task goes in ALL categories where it belongs

When suggesting actions, be specific, reference the Serpent system, and tie back to the Direction when relevant. Be concise and actionable.
Format your responses with markdown for readability.`;
}

export default function AIChat({ tasks, projects, onSaveTasks, onSaveProjects }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => store.getChatHistory());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    store.saveChatHistory(messages as any);
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const clearHistory = () => { setMessages([]); };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || isLoading) return;

    let userContent: ChatMessage["content"];
    if (pendingImage) {
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      if (text) parts.push({ type: "text", text });
      else parts.push({ type: "text", text: "Please analyze this image. Extract any text (OCR) and describe what you see." });
      parts.push({ type: "image_url", image_url: { url: pendingImage } });
      userContent = parts;
    } else {
      userContent = text;
    }

    const userMsg: ChatMessage = { role: "user", content: userContent };
    setInput("");
    setPendingImage(null);
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const allMessages = [...messages, userMsg];

    try {
      const resp = await supabase.functions.invoke("serpent-ai", {
        body: {
          messages: allMessages,
          systemPrompt: buildSystemPrompt(tasks, projects),
        },
      });

      if (resp.error) throw resp.error;

      const data = resp.data;
      const assistantContent = data?.choices?.[0]?.message?.content || data?.content || "I couldn't process that. Please try again.";

      // Check for project creation command — save to Life Plan
      const textInput = typeof userContent === "string" ? userContent : getTextContent(userContent);
      const projectName = extractProjectName(textInput);
      let createdProjectId: string | null = null;
      if (projectName) {
        createdProjectId = addLifePlanProject(projectName);
        // Also keep legacy state in sync so the AI sees it immediately
        onSaveProjects((currentProjects) => [
          ...currentProjects,
          {
            id: createdProjectId || uuid(),
            name: `📋 ${projectName}`,
            description: "Life Plan project",
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      // Check for task creation command
      const taskTitle = extractTaskTitle(textInput);
      let createdTaskTitle: string | null = null;
      if (taskTitle) {
        const categories = extractCategories(assistantContent);
        const projectId = extractProjectId(assistantContent, projects);
        onSaveTasks((currentTasks) => [
          ...currentTasks,
          {
            id: uuid(),
            title: taskTitle,
            categories: categories.length > 0 ? categories : ["A3"],
            completed: false,
            createdAt: new Date().toISOString(),
            projectId,
          },
        ]);
        createdTaskTitle = taskTitle;
      }

      // Check for note creation command — persist to Cloud.
      // Supports both explicit forms ("save a note about X") and short
      // confirmations like "yes, save it as a note" / "pin it" by falling
      // back to deriving the title + body from recent assistant content.
      let createdNoteTitle: string | null = null;
      let noteTopic = extractNoteTopic(textInput);
      let noteBody = assistantContent;
      if (!noteTopic && (hasNoteIntent(textInput) || (AFFIRMATION_REGEX.test(textInput) && /\b(note|pin|checklist|save)\b/i.test(textInput)))) {
        // Pull body from the most recent assistant message that has substance.
        let sourceText = assistantContent;
        if (!sourceText || sourceText.length < 60) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role !== "assistant") continue;
            const t = getTextContent(messages[i].content);
            if (t && t.length >= 60) { sourceText = t; break; }
          }
        }
        // Try to honor an explicit quoted title in the user's confirmation
        const q = textInput.match(/["\u201C\u201D']([^"\u201C\u201D'\n]{2,120})["\u201C\u201D']/);
        noteTopic = (q ? q[1] : deriveTitleFromContent(sourceText)).trim();
        noteBody = sourceText;
      }
      if (noteTopic) {
        const id = await createResearchNote(noteTopic, noteBody);
        if (id) createdNoteTitle = noteTopic;
      }

      // Check for list creation command — persist to Cloud
      let listName = extractListName(textInput);
      if (listName && /^lists?$/i.test(listName)) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const prev = getTextContent(messages[i].content);
          const named = extractListName(prev);
          if (named && !/^lists?$/i.test(named)) { listName = named; break; }
        }
      }
      let createdListName: string | null = null;
      if (listName) {
        let items = extractBullets(textInput);
        if (items.length === 0) items = extractListItemsFromUser(textInput, listName);
        if (items.length === 0) items = extractBullets(assistantContent);
        const id = await createListWithItems(listName, items);
        if (id) createdListName = listName;
      }

      // Check for calendar event command
      let createdEventTitle: string | null = null;
      const eventTitle = extractEventTitle(textInput);
      if (eventTitle) {
        const dt = parseEventDateTime(textInput);
        if (dt) {
          const id = addCalendarEvent(eventTitle, dt);
          if (id) createdEventTitle = `${eventTitle} (${dt.allDay ? dt.start.slice(0,10) : dt.start.replace("T", " ")})`;
        }
      }

      const confirmations: string[] = [];
      if (createdProjectId) confirmations.push(`✅ Project **"${projectName}"** added to your Life Plan.`);
      if (createdTaskTitle) confirmations.push(`✅ Task **"${createdTaskTitle}"** added.`);
      if (createdNoteTitle) confirmations.push(`✅ Research note **"${createdNoteTitle}"** saved.`);
      if (createdListName) confirmations.push(`✅ List **"${createdListName}"** saved with all items.`);
      if (createdEventTitle) confirmations.push(`📅 Calendar event **"${createdEventTitle}"** added to your calendar.`);

      // If we successfully added a calendar event, don't show the LLM's
      // (often confused "I can't add to your calendar") text — replace it.
      const baseContent = createdEventTitle
        ? `📅 Done — added **"${createdEventTitle}"** to your in-app calendar.`
        : assistantContent;
      const finalContent = confirmations.length > 0 && !createdEventTitle
        ? `${baseContent}\n\n${confirmations.join("\n")}`
        : createdEventTitle
          ? baseContent
          : confirmations.length > 0 ? `${baseContent}\n\n${confirmations.join("\n")}` : baseContent;
      setMessages((prev) => [...prev, { role: "assistant", content: finalContent }]);
    } catch (e: any) {
      console.error("AI error:", e);
      const errorMsg = e?.message?.includes("429")
        ? "Rate limit reached. Please wait a moment and try again."
        : e?.message?.includes("402")
        ? "AI credits exhausted. Please add funds in Settings > Workspace > Usage."
        : "Something went wrong. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground truncate">
            Memory · OCR · Tasks · Notes · Lists
          </p>
          {messages.length > 0 && (
            <button onClick={clearHistory} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded border border-border hover:border-destructive/30">
              <Trash2 size={10} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <Bot size={48} className="text-primary/30 mx-auto" />
            <p className="text-muted-foreground text-sm">Start a conversation with your Serpent AI</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
              {[
                "What should I do today?",
                "Help me plan my week",
                'Add project "Learn Spanish"',
                "Suggest a hate day plan",
              ].map((q) => (
                <button key={q} onClick={() => setInput(q)} className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const textContent = getTextContent(msg.content);
          const hasImage = Array.isArray(msg.content) && msg.content.some(c => c.type === "image_url");
          const imageUrl = hasImage ? (msg.content as any[]).find(c => c.type === "image_url")?.image_url?.url : null;

          return (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center">
                  <Bot size={14} className="text-primary" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"
              }`}>
                {imageUrl && (
                  <img src={imageUrl} alt="Uploaded" className="max-w-full max-h-48 rounded mb-2" />
                )}
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-primary prose-code:bg-secondary prose-code:px-1 prose-code:rounded">
                    <ReactMarkdown>{textContent}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{textContent}</p>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-md bg-secondary flex items-center justify-center">
                  <User size={14} className="text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center">
              <Bot size={14} className="text-primary" />
            </div>
            <div className="bg-card border border-border rounded-lg px-4 py-2.5">
              <Loader2 size={16} className="animate-spin text-primary" />
            </div>
          </div>
        )}
      </div>

      {/* Pending image preview */}
      {pendingImage && (
        <div className="px-4 py-2 border-t border-border bg-secondary/50">
          <div className="flex items-center gap-2">
            <img src={pendingImage} alt="Preview" className="h-12 w-12 object-cover rounded" />
            <span className="text-xs text-muted-foreground">Image attached</span>
            <button onClick={() => setPendingImage(null)} className="text-muted-foreground hover:text-destructive text-xs ml-auto">Remove</button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="text-muted-foreground hover:text-primary p-2.5 transition-colors" title="Upload image for OCR">
            <ImageIcon size={18} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask about tasks, send images for OCR, plan your day..."
            className="flex-1 bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isLoading}
          />
          <button onClick={send} disabled={(!input.trim() && !pendingImage) || isLoading} className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-30 transition-opacity">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
