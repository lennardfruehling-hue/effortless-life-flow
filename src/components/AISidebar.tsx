import { useState } from "react";
import { Bot, ChevronRight, ChevronLeft } from "lucide-react";
import { Task, Project } from "@/lib/types";
import AIChat from "./AIChat";

interface Props {
  tasks: Task[];
  projects: Project[];
  onSaveTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onSaveProjects: React.Dispatch<React.SetStateAction<Project[]>>;
}

export default function AISidebar({ tasks, projects, onSaveTasks, onSaveProjects }: Props) {
  const [open, setOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
  );

  if (!open) {
    return (
      <div className="flex flex-col items-center border-l border-border bg-sidebar w-12 flex-shrink-0">
        <button
          onClick={() => setOpen(true)}
          className="mt-4 p-2 text-muted-foreground hover:text-primary"
          title="Open AI Assistant"
        >
          <ChevronLeft size={18} />
        </button>
        <Bot size={20} className="text-primary/60 mt-3" />
      </div>
    );
  }

  return (
    <aside className="flex flex-col border-l border-border bg-sidebar w-[320px] flex-shrink-0 h-screen sticky top-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Bot size={16} className="text-primary" /> AI Assistant
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 text-muted-foreground hover:text-foreground"
          title="Collapse"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <AIChat
          tasks={tasks}
          projects={projects}
          onSaveTasks={onSaveTasks}
          onSaveProjects={onSaveProjects}
        />
      </div>
    </aside>
  );
}
