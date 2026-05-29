import { useState } from "react";
import { BookOpen, Mail, NotebookPen, Car, Baby } from "lucide-react";
import { Project, Task, Reminder } from "@/lib/types";
import ResearchView from "./ResearchView";
import GmailView from "./GmailView";
import OneNoteView from "./OneNoteView";
import CarMaintenanceView from "./CarMaintenanceView";
import BabyView from "./BabyView";

type Sub = "notes" | "baby" | "car" | "gmail" | "onenote";

const TABS: { id: Sub; label: string; icon: typeof BookOpen }[] = [
  { id: "notes", label: "Notes", icon: BookOpen },
  { id: "baby", label: "Baby", icon: Baby },
  { id: "car", label: "Car", icon: Car },
  { id: "gmail", label: "Gmail", icon: Mail },
  { id: "onenote", label: "OneNote", icon: NotebookPen },
];

interface Props {
  projects: Project[];
  tasks: Task[];
  onSaveTasks: (t: Task[]) => void;
  reminders: Reminder[];
  onSaveReminders: (r: Reminder[]) => void;
}

export default function ResearchTabs({ projects, tasks, onSaveTasks, reminders, onSaveReminders }: Props) {
  const [sub, setSub] = useState<Sub>("notes");

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Subtab bar */}
      <div className="flex-shrink-0 border-b border-border bg-card/30 px-4 flex items-center gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
              sub === id
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {sub === "notes" && <ResearchView projects={projects} />}
        {sub === "baby" && (
          <BabyView projects={projects} tasks={tasks} onSaveTasks={onSaveTasks} />
        )}
        {sub === "car" && (
          <CarMaintenanceView
            tasks={tasks}
            onSaveTasks={onSaveTasks}
            reminders={reminders}
            onSaveReminders={onSaveReminders}
          />
        )}
        {sub === "gmail" && <GmailView />}
        {sub === "onenote" && <OneNoteView />}
      </div>
    </div>
  );
}
