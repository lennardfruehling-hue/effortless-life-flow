import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from "react";
import { Task, Project, Category, ALL_CATEGORIES, CATEGORY_META } from "@/lib/types";
import { v4 as uuid } from "uuid";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AIChatProps {
  tasks: Task[];
  projects: Project[];
  onSaveTasks: Dispatch<SetStateAction<Task[]>>;
  onSaveProjects: Dispatch<SetStateAction<Project[]>>;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const TASK_COMMAND_REGEX = /^(?:add|create|new)\s+task\s+(?:["“](.+?)["”]|(.+))$/i;
const CATEGORY_CODE_REGEX = /\b(A1|A2|A3|B1|B2|C|D|E|F|G|H|I|J)\b(?=\s*:|\b)/g;
const LIFE_PLAN_PROJECT_REGEX = /\b(lp-[a-z0-9]+)\b/i;

function extractTaskTitle(input: string) {
  const match = input.trim().match(TASK_COMMAND_REGEX);
  return match ? (match[1] || match[2] || "").trim() : "";
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

function buildSystemPrompt(tasks: Task[], projects: Project[]): string {
  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const categoryDescriptions = ALL_CATEGORIES.map(
    (cat) => `${cat}: ${CATEGORY_META[cat].label} - ${CATEGORY_META[cat].description}`
  ).join("\n");

  const taskList = activeTasks.map((t) =>
    `- [${t.id.slice(0, 8)}] "${t.title}" (categories: ${t.categories.join(", ")}${t.projectId ? `, project: ${t.projectId}` : ""}${t.location ? `, location: ${t.location}` : ""}${t.hateMagnitude ? `, hate: ${t.hateMagnitude}/10` : ""})`
  ).join("\n");

  const projectList = projects.map((p) => `- [${p.id.slice(0, 8)}] "${p.name}"${p.description ? ` - ${p.description}` : ""}`).join("\n");

  return `You are the Serpent List AI assistant. You help manage tasks, projects, and life planning.

## Serpent List Categories
${categoryDescriptions}

## Current Active Tasks (${activeTasks.length})
${taskList || "No active tasks"}

## Completed Tasks: ${completedTasks.length}

## Projects
${projectList || "No projects"}

## Your Capabilities
You can help users:
1. Create new tasks - suggest categories, help prioritize
2. Edit existing tasks - change categories, titles, descriptions
3. Plan their day - recommend which tasks to do based on the Serpent system
4. Manage projects - suggest new projects or organize existing ones
5. Life planning advice - based on the Serpent prioritization system

## Serpent System Rules
- A1 tasks are done FIRST (today, urgent)
- Then pick tasks with the MOST categories (highest overlap = highest priority)
- D tasks close geographically should be batched together
- On bad days: do A1+B1 only, then G+H (things you enjoy/feel proud of)
- On hate days: batch all E+F tasks and clear them out
- Every new task goes in ALL categories where it belongs

When suggesting actions, be specific and reference the Serpent system. Be concise and actionable.`;
}

export default function AIChat({ tasks, projects, onSaveTasks, onSaveProjects }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setInput("");
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

      const taskTitle = extractTaskTitle(text);
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

      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
    } catch (e: any) {
      console.error("AI error:", e);
      const errorMsg = e?.message?.includes("429")
        ? "Rate limit reached. Please wait a moment and try again."
        : e?.message?.includes("402")
        ? "AI credits exhausted. Please add funds in Settings → Workspace → Usage."
        : "Something went wrong. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <div className="p-6 pb-3 border-b border-border">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bot size={24} className="text-primary" /> AI Assistant
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ask me to create tasks, plan your day, or organize your projects
        </p>
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
                "What tasks have the most categories?",
                "Suggest a hate day plan",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center">
                <Bot size={14} className="text-primary" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-foreground"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-md bg-secondary flex items-center justify-center">
                <User size={14} className="text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

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

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask about tasks, plan your day, manage projects..."
            className="flex-1 bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isLoading}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isLoading}
            className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
