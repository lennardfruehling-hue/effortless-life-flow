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

const TASK_COMMAND_REGEX = /(?:add|create|new|save|make|put)\s+(?:a\s+|an\s+|the\s+)?task\s+(?:called\s+|named\s+)?(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([^.!?\n]+?))(?:\s+(?:to|in|into|on)\s+(?:the\s+|my\s+)?(?:tasks?|list|todo)s?)?(?:[.!?]|$)/i;
const PROJECT_COMMAND_REGEX = /(?:add|create|new|save|make|start|put)\s+(?:a\s+|an\s+|the\s+)?project\s+(?:called\s+|named\s+)?(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([^.!?\n]+?))(?:\s+(?:to|in|into|on)\s+(?:the\s+|my\s+)?(?:projects?|life[- ]?plan|plan))?(?:[.!?]|$)/i;
const NOTE_COMMAND_REGEX = /(?:add|create|new|save|make|write|put)\s+(?:a\s+|an\s+|the\s+)?(?:research\s+)?note\s+(?:called\s+|named\s+|about\s+|on\s+)?(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([^.!?\n]+?))(?:\s+(?:to|in|into)\s+(?:the\s+|my\s+)?(?:notes?|research))?(?:[.!?]|$)/i;
const LIST_COMMAND_REGEX = /(?:add|create|new|save|make|start|build|put)\s+(?:a\s+|an\s+|the\s+)?(?:packing\s+|shopping\s+|todo\s+|to-do\s+)?list\s+(?:called\s+|named\s+|for\s+)?(?:["\u201C\u201D'](.+?)["\u201C\u201D']|([^.!?\n]+?))(?:\s+(?:to|in|into|on)\s+(?:the\s+|my\s+)?lists?)?(?:[.!?]|$)/i;
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

function extractListName(input: string) {
  const match = input.trim().match(LIST_COMMAND_REGEX);
  return match ? (match[1] || match[2] || "").trim() : "";
}

async function createResearchNote(title: string, body: string) {
  const { data } = await supabase
    .from("research_notes")
    .insert({ title })
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
  const { data } = await supabase.from("task_lists").insert({ name }).select().single();
  if (!data) return null;
  if (items.length > 0) {
    await supabase.from("list_items").insert(
      items.map((content, i) => ({ list_id: data.id, position: i, content }))
    );
  }
  window.dispatchEvent(new CustomEvent("lists-updated"));
  return data.id as string;
}

// Pull a bullet-list out of an AI response, if any
function extractBullets(text: string): string[] {
  const lines = text.split("\n").map(l => l.trim());
  return lines
    .filter(l => /^([-*•]|\d+\.)\s+/.test(l))
    .map(l => l.replace(/^([-*•]|\d+\.)\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
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
6. Life planning advice - based on the Serpent prioritization system
7. **Analyze images** - OCR, extract text, read documents, interpret screenshots
8. **Save research notes** - when user says "save a note about X" or "write a note on X", produce a markdown body (use # for headings, - for bullets) that will become a Notion-style note
9. **Build lists** - when user says "make a packing list for Tokyo", reply with a clear bulleted list (one item per line starting with "-"); items will be saved automatically

## Serpent System Rules
- A1 tasks are done FIRST (today, urgent)
- Then pick tasks with the MOST categories (highest overlap = highest priority)
- D tasks close geographically should be batched together
- On bad days: do A1+B1 only, then G+H (things you enjoy/feel proud of)
- On hate days: batch all E+F tasks and clear them out
- Every new task goes in ALL categories where it belongs

When suggesting actions, be specific and reference the Serpent system. Be concise and actionable.
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
      }

      // Check for note creation command — persist to Cloud
      const noteTopic = extractNoteTopic(textInput);
      let createdNoteTitle: string | null = null;
      if (noteTopic) {
        const id = await createResearchNote(noteTopic, assistantContent);
        if (id) createdNoteTitle = noteTopic;
      }

      // Check for list creation command — persist to Cloud with bullets from AI reply
      const listName = extractListName(textInput);
      let createdListName: string | null = null;
      if (listName) {
        const items = extractBullets(assistantContent);
        const id = await createListWithItems(listName, items);
        if (id) createdListName = listName;
      }

      const confirmations: string[] = [];
      if (createdProjectId) confirmations.push(`✅ Project **"${projectName}"** added to your Life Plan.`);
      if (createdNoteTitle) confirmations.push(`✅ Research note **"${createdNoteTitle}"** saved.`);
      if (createdListName) confirmations.push(`✅ List **"${createdListName}"** saved with all items.`);
      const finalContent = confirmations.length > 0
        ? `${assistantContent}\n\n${confirmations.join("\n")}`
        : assistantContent;
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
