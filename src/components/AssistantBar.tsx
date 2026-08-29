import { useState } from "react";
import { Bot, Mic, AudioLines, MessageSquare, Bell, ChevronUp, ChevronDown, X } from "lucide-react";
import { Task, Project } from "@/lib/types";
import AIChat from "./AIChat";
import VoiceAssistant from "./VoiceAssistant";
import VoiceTaskDialog from "./VoiceTaskDialog";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";

interface Props {
  tasks: Task[];
  projects: Project[];
  onSaveTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onSaveProjects: React.Dispatch<React.SetStateAction<Project[]>>;
}

type Panel = "voice" | "chat" | "notifications" | null;

export default function AssistantBar({ tasks, projects, onSaveTasks, onSaveProjects }: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { notifications, dismiss, dismissAll } = useAssignmentNotifications(tasks);

  const handleVoiceSave = (task: Task) => {
    onSaveTasks((prev) => [task, ...prev]);
    setVoiceOpen(false);
  };

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const tabBtn = (id: Exclude<Panel, null>, Icon: typeof Bot, label: string) => (
    <button
      onClick={() => toggle(id)}
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        panel === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      }`}
    >
      <Icon size={16} strokeWidth={2} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-6px_24px_-12px_hsl(220_40%_30%/0.25)]">
        {panel && (
          <div className="mx-auto max-w-[1400px] px-3 pt-2">
            <div className="h-[min(52vh,460px)] rounded-t-xl border border-b-0 border-border bg-card overflow-hidden">
              {panel === "voice" && (
                <VoiceAssistant tasks={tasks} projects={projects} onSaveTasks={onSaveTasks} onSaveProjects={onSaveProjects} />
              )}
              {panel === "chat" && (
                <AIChat tasks={tasks} projects={projects} onSaveTasks={onSaveTasks} onSaveProjects={onSaveProjects} />
              )}
              {panel === "notifications" && (
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <span className="text-sm font-semibold text-foreground">Notifications</span>
                    {notifications.length > 0 && (
                      <button onClick={dismissAll} className="text-xs text-muted-foreground hover:text-foreground">
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-10">Nothing new. You're all caught up.</p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                          <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${n.kind === "task" ? "bg-primary" : "bg-cat-e"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{n.label}</p>
                            {n.detail && <p className="text-xs text-muted-foreground truncate">{n.detail}</p>}
                          </div>
                          <button onClick={() => dismiss(n.id)} className="text-muted-foreground hover:text-foreground p-1">
                            <X size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-[1400px] px-3 h-14 flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground pr-1">
            <Bot size={17} className="text-primary" />
            <span className="hidden md:inline">Assistant</span>
          </div>

          {tabBtn("voice", AudioLines, "Voice")}
          {tabBtn("chat", MessageSquare, "Chat")}

          <button
            onClick={() => setVoiceOpen(true)}
            title="Add task by voice"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Mic size={16} />
            <span className="hidden sm:inline">Quick add</span>
          </button>

          <div className="flex-1" />

          <button
            onClick={() => toggle("notifications")}
            title="Notifications"
            className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              panel === "notifications" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <Bell size={16} />
            <span className="hidden sm:inline">Notifications</span>
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {notifications.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setPanel((c) => (c ? null : "chat"))}
            title={panel ? "Collapse" : "Expand"}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {panel ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {voiceOpen && <VoiceTaskDialog onClose={() => setVoiceOpen(false)} onSave={handleVoiceSave} />}
    </>
  );
}
