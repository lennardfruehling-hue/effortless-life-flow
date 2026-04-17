import { ViewMode } from "@/lib/types";
import { ListTodo, Compass, Bell, Bot, BookOpen, CalendarDays, ListChecks } from "lucide-react";

const NAV_ITEMS: { mode: ViewMode; icon: typeof ListTodo; label: string }[] = [
  { mode: "tasks", icon: ListTodo, label: "Tasks" },
  { mode: "lifeplan", icon: Compass, label: "Life Plan" },
  { mode: "research", icon: BookOpen, label: "Research" },
  { mode: "lists", icon: ListChecks, label: "Lists" },
  { mode: "calendar", icon: CalendarDays, label: "Calendar" },
  { mode: "reminders", icon: Bell, label: "Reminders" },
  { mode: "ai", icon: Bot, label: "AI Assistant" },
];

export default function Sidebar({
  active,
  onChange,
  taskCount,
}: {
  active: ViewMode;
  onChange: (v: ViewMode) => void;
  taskCount: number;
}) {
  return (
    <aside className="w-56 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0">
      <div className="p-5 pb-3">
        <h1 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
          <span className="text-primary">🐍</span> Serpent List
        </h1>
        <p className="text-xs text-muted-foreground mt-1 font-mono">{taskCount} tasks</p>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              active === mode
                ? "bg-sidebar-accent text-primary font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
          Do A1 first → then highest category count → batch D together → hate day for E+F
        </p>
      </div>
    </aside>
  );
}
