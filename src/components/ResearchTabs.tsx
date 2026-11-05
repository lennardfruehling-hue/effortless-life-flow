import { useState } from "react";
import { BookOpen, Mail, NotebookPen, Car, Baby, Home, Briefcase } from "lucide-react";
import { Project, Task, Reminder } from "@/lib/types";
import ResearchView from "./ResearchView";
import GmailView from "./GmailView";
import OneNoteView from "./OneNoteView";
import CarMaintenanceView from "./CarMaintenanceView";
import BabyView from "./BabyView";
import ApartmentHuntView from "./ApartmentHuntView";
import JobHuntView from "./JobHuntView";
import HousehuntView from "./HousehuntView";
import { Button } from "@/components/ui/button";

type Sub = "notes" | "baby" | "car" | "apartments" | "jobs" | "househunt" | "gmail" | "onenote";

const TABS: { id: Sub; label: string; icon: typeof BookOpen }[] = [
  { id: "notes", label: "Notes", icon: BookOpen },
  { id: "baby", label: "Baby", icon: Baby },
  { id: "car", label: "Car", icon: Car },
  { id: "apartments", label: "Apartments", icon: Home },
  { id: "jobs", label: "Job Hunt", icon: Briefcase },
  { id: "househunt", label: "Househunt", icon: Home },
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
      <div className="flex-shrink-0 border-b border-border bg-card/30 px-4 flex items-center gap-1 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Button variant="ghost"
            key={id}
            onClick={() => setSub(id)}
            className={`shrink-0 rounded-none h-auto flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
              sub === id
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} /> {label}
          </Button>
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
        {sub === "apartments" && <ApartmentHuntView />}
        {sub === "jobs" && <JobHuntView tasks={tasks} onSaveTasks={onSaveTasks} projects={projects} />}
        {sub === "househunt" && <HousehuntView />}
        {sub === "gmail" && <GmailView />}
        {sub === "onenote" && <OneNoteView />}
      </div>
    </div>
  );
}
