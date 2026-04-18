import { useState } from "react";
import { BookOpen, Mail, NotebookPen } from "lucide-react";
import { Project } from "@/lib/types";
import ResearchView from "./ResearchView";
import GmailView from "./GmailView";
import OneNoteView from "./OneNoteView";

type Sub = "notes" | "gmail" | "onenote";

const TABS: { id: Sub; label: string; icon: typeof BookOpen }[] = [
  { id: "notes", label: "Notes", icon: BookOpen },
  { id: "gmail", label: "Gmail", icon: Mail },
  { id: "onenote", label: "OneNote", icon: NotebookPen },
];

export default function ResearchTabs({ projects }: { projects: Project[] }) {
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
        {sub === "gmail" && <GmailView />}
        {sub === "onenote" && <OneNoteView />}
      </div>
    </div>
  );
}
