import { useState, useMemo, useEffect } from "react";
import { Task, ViewMode } from "@/lib/types";
import { ListTodo, Compass, Bell, BookOpen, CalendarDays, ListChecks, LogOut, Users, Flame, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import HouseholdSettings from "./HouseholdSettings";
import { totalPride, prideThisWeek, computeConsistency } from "@/lib/pride";
import serpentBg from "@/assets/serpent-sidebar.jpg";
import serpentStrike from "@/assets/serpent-sidebar-strike.jpg";
import serpentSleep from "@/assets/serpent-sidebar-sleep.jpg";
import { loadFlowState, onFlowStateChange, phaseLabel, SerpentFlowDayState } from "@/lib/serpentFlowState";

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
  tasks,
}: {
  active: ViewMode;
  onChange: (v: ViewMode) => void;
  taskCount: number;
  tasks?: Task[];
}) {
  const { user, signOut } = useAuth();
  const [showHousehold, setShowHousehold] = useState(false);
  const { pride, weekPride, streak } = useMemo(() => {
    const t = tasks ?? [];
    return {
      pride: totalPride(t),
      weekPride: prideThisWeek(t),
      streak: computeConsistency(t).currentStreak,
    };
  }, [tasks]);
  const [scheduleActive, setScheduleActive] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => setScheduleActive(!!(e as CustomEvent).detail);
    window.addEventListener("schedule-active-change", handler);
    return () => window.removeEventListener("schedule-active-change", handler);
  }, []);
  const [flow, setFlow] = useState<SerpentFlowDayState>(loadFlowState);
  useEffect(() => onFlowStateChange(setFlow), []);
  // Schedule-active forces "action" backdrop while open, otherwise follow the flow phase.
  const phase = scheduleActive ? "action" : flow.phase;
  const trioDone = (flow.startCompleted ? 1 : 0) + (flow.middayCompleted ? 1 : 0) + (flow.eveningCompleted ? 1 : 0);
  return (
    <>
    <aside className="relative w-16 md:w-60 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0 overflow-hidden">
      {/* Calm serpent backdrop — idle / planning */}
      <img
        src={serpentBg}
        alt=""
        aria-hidden
        className={`pointer-events-none absolute inset-0 w-full h-full object-cover object-center transition-all duration-[1200ms] ease-out ${
          phase === "action" || phase === "review" ? "opacity-0 scale-105" : "opacity-50 scale-100"
        }`}
      />
      {/* Striking serpent — In Action */}
      <img
        src={serpentStrike}
        alt=""
        aria-hidden
        className={`pointer-events-none absolute inset-0 w-full h-full object-cover object-center transition-all duration-[1400ms] ease-out ${
          phase === "action" ? "opacity-70 scale-110" : "opacity-0 scale-100"
        }`}
      />
      {/* Sleeping serpent — In Review */}
      <img
        src={serpentSleep}
        alt=""
        aria-hidden
        className={`pointer-events-none absolute inset-0 w-full h-full object-cover object-center transition-all duration-[1400ms] ease-out ${
          phase === "review" ? "opacity-65 scale-100" : "opacity-0 scale-105"
        }`}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-sidebar/40"
      />

      <div className="relative flex flex-col h-full">
      <div className="px-4 pt-3 pb-3 flex flex-col items-center text-center">
        <h1
          className="hidden md:block text-white leading-none"
          style={{ fontFamily: "'Great Vibes', 'Allura', cursive", fontSize: "2.5rem", textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}
        >
          Serpent List
        </h1>
        <p className="hidden md:block text-[11px] text-white/80 mt-2 font-mono tracking-wide">
          {taskCount} open tasks
        </p>
        <div className="mt-2 flex items-center gap-1">
          {(["planning", "action", "review"] as const).map((p) => {
            const isOn = phase === p;
            const styles =
              p === "planning" ? "bg-amber-500/25 border-amber-300/60 text-amber-50" :
              p === "action"   ? "bg-orange-500/30 border-orange-300/70 text-orange-50" :
                                 "bg-indigo-500/30 border-indigo-300/60 text-indigo-50";
            const off = "bg-white/5 border-white/15 text-white/50 hover:text-white/80 hover:border-white/30";
            return (
              <button
                key={p}
                onClick={() => window.dispatchEvent(new CustomEvent("serpent-set-phase", { detail: isOn ? null : p }))}
                title={`Force phase: ${phaseLabel(p)}${isOn ? " (click to clear)" : ""}`}
                className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition ${isOn ? styles : off}`}
              >
                {p === "planning" ? "Plan" : p === "action" ? "Act" : "Review"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1" />
      <nav className="px-2 md:px-3 space-y-1">
        {NAV_ITEMS.map(({ mode, icon: Icon, label }) => {
          const isActive = active === mode;
          const phaseColor =
            phase === "action"   ? "text-orange-200" :
            phase === "review"   ? "text-indigo-200" :
            phase === "planning" ? "text-amber-200" :
                                   "text-white";
          const phaseIcon =
            phase === "action"   ? "text-orange-300" :
            phase === "review"   ? "text-indigo-300" :
            phase === "planning" ? "text-amber-300" :
                                   "text-white";
          return (
            <button
              key={mode}
              data-tour={`nav-${mode}`}
              onClick={() => onChange(mode)}
              title={label}
              className={`group w-full flex items-center justify-center md:justify-start gap-3 px-2.5 md:px-3 py-2 rounded-lg text-sm font-bold transition-all ${phaseColor} ${
                isActive ? "bg-sidebar-accent shadow-sm" : "hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon size={17} strokeWidth={isActive ? 2.5 : 2} className={`${phaseIcon} drop-shadow`} />
              <span className="hidden md:inline">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        <button
          onClick={() => onChange("consistency")}
          title={`Pride ${pride} · ${weekPride} this week · ${streak}-day streak · Serpent ${trioDone}/3 today`}
          className="w-full flex items-center justify-center md:justify-between gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-sidebar-accent/40 hover:bg-sidebar-accent/70 transition-colors mb-1"
        >
          <span className="flex items-center gap-1.5 text-white">
            <Trophy size={15} className="text-amber-300" strokeWidth={2.25} />
            <span className="hidden md:inline text-xs font-bold tabular-nums">{pride}</span>
          </span>
          <span className="hidden md:flex items-center gap-1 text-white">
            <Flame size={14} className="text-orange-400" strokeWidth={2.25} />
            <span className="text-xs font-bold tabular-nums">{streak}</span>
          </span>
        </button>
        <div
          className="w-full flex items-center justify-center md:justify-between gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg bg-sidebar-accent/20 mb-1"
          title={`Serpent flow today: ${trioDone}/3 (Start ${flow.startCompleted ? "✓" : "·"} · Midday ${flow.middayCompleted ? "✓" : "·"} · Evening ${flow.eveningCompleted ? "✓" : "·"})`}
        >
          <span className="hidden md:inline text-[10px] font-mono uppercase tracking-wider text-white/70">Serpent</span>
          <span className="flex items-center gap-1">
            {[
              { ok: flow.startCompleted, label: "S" },
              { ok: flow.middayCompleted, label: "M" },
              { ok: flow.eveningCompleted, label: "E" },
            ].map((d, i) => (
              <span
                key={i}
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border ${
                  d.ok ? "bg-emerald-500/80 border-emerald-300 text-white" : "bg-transparent border-white/30 text-white/50"
                }`}
              >
                {d.ok ? "✓" : d.label}
              </span>
            ))}
          </span>
        </div>
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
