import { useState } from "react";
import { ViewMode } from "@/lib/types";
import { ListTodo, Compass, Bell, BookOpen, CalendarDays, ListChecks, LogOut, Users, Flame } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import HouseholdSettings from "./HouseholdSettings";
import serpentBg from "@/assets/serpent-sidebar.jpg";

const NAV_ITEMS: { mode: ViewMode; icon: typeof ListTodo; label: string }[] = [
  { mode: "tasks", icon: ListTodo, label: "Tasks" },
  { mode: "lifeplan", icon: Compass, label: "Life Plan" },
  { mode: "consistency", icon: Flame, label: "Consistency" },
  { mode: "research", icon: BookOpen, label: "Notes" },
  { mode: "lists", icon: ListChecks, label: "Lists" },
  { mode: "calendar", icon: CalendarDays, label: "Calendar" },
  { mode: "reminders", icon: Bell, label: "Reminders" },
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
  const { user, signOut } = useAuth();
  const [showHousehold, setShowHousehold] = useState(false);
  return (
    <>
    <aside className="relative w-16 md:w-60 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0 overflow-hidden">
      {/* Mythic serpent background */}
      <img
        src={serpentBg}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 w-full h-full object-cover object-center opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-sidebar/40"
      />
      <div className="relative flex flex-col h-full">
      <div className="px-4 pt-6 pb-4 text-center">
        <h1
          className="text-2xl text-white tracking-wide"
          style={{ fontFamily: "'UnifrakturCook', 'UnifrakturMaguntia', 'Cinzel', serif", fontWeight: 700, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
        >
          🐍 Serpent List
        </h1>
        <p className="hidden md:block text-[11px] text-white/80 mt-2 font-mono tracking-wide">
          {taskCount} open tasks
        </p>
      </div>

      <div className="flex-1" />
      <nav className="px-2 md:px-3 space-y-1">
        {NAV_ITEMS.map(({ mode, icon: Icon, label }) => {
          const isActive = active === mode;
          return (
            <button
              key={mode}
              onClick={() => onChange(mode)}
              title={label}
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.85)" }}
              className={`group w-full flex items-center justify-center md:justify-start gap-3 px-2.5 md:px-3 py-2 rounded-lg text-sm font-bold text-white transition-all ${
                isActive ? "bg-sidebar-accent shadow-sm" : "hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon size={17} strokeWidth={isActive ? 2.5 : 2} className="text-white drop-shadow" />
              <span className="hidden md:inline text-white">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        {user && (
          <p className="hidden md:block text-[10px] text-muted-foreground font-mono truncate mb-1.5 px-1" title={user.email ?? ""}>
            {user.email}
          </p>
        )}
        <button
          onClick={() => setShowHousehold(true)}
          title="Household"
          className="w-full flex items-center justify-center md:justify-start gap-2.5 px-2.5 md:px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
        >
          <Users size={16} strokeWidth={1.75} />
          <span className="hidden md:inline">Household</span>
        </button>
        <button
          onClick={signOut}
          title="Sign out"
          className="w-full flex items-center justify-center md:justify-start gap-2.5 px-2.5 md:px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut size={16} strokeWidth={1.75} />
          <span className="hidden md:inline">Sign out</span>
        </button>
      </div>
      </div>
    </aside>
    {showHousehold && <HouseholdSettings onClose={() => setShowHousehold(false)} />}
    </>
  );
}
