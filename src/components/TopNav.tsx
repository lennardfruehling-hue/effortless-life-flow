import { useState, useMemo, useEffect } from "react";
import { Task, ViewMode } from "@/lib/types";
import {
  ListTodo, Compass, BookOpen, CalendarDays, ListChecks, LogOut, Users,
  Flame, Trophy, Clock, Mail, Bell, Settings, Menu, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import HouseholdSettings from "./HouseholdSettings";
import FlowCutoffSettings from "./FlowCutoffSettings";
import NotificationSettingsModal from "./NotificationSettings";
import { totalPride, prideThisWeek, computeConsistency } from "@/lib/pride";
import serpentBg from "@/assets/serpent-sidebar.jpg";
import serpentStrike from "@/assets/serpent-sidebar-strike.jpg";
import serpentSleep from "@/assets/serpent-sidebar-sleep.jpg";
import { loadFlowState, onFlowStateChange, phaseLabel, SerpentFlowDayState } from "@/lib/serpentFlowState";
import { loadPhaseToggleVisible, onPhaseToggleVisibleChange } from "@/lib/flowSettings";

const NAV_ITEMS: { mode: ViewMode; icon: typeof ListTodo; label: string }[] = [
  { mode: "tasks", icon: ListTodo, label: "Tasks" },
  { mode: "lifeplan", icon: Compass, label: "Life Plan" },
  { mode: "consistency", icon: Flame, label: "Consistency" },
  { mode: "research", icon: BookOpen, label: "Notes" },
  { mode: "lists", icon: ListChecks, label: "Lists" },
  { mode: "calendar", icon: CalendarDays, label: "Calendar" },
  { mode: "reminders", icon: Bell, label: "Reminders" },
];

export default function TopNav({
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
  const [showFlowTimes, setShowFlowTimes] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const { pride, streak } = useMemo(() => {
    const t = tasks ?? [];
    return { pride: totalPride(t), weekPride: prideThisWeek(t), streak: computeConsistency(t).currentStreak };
  }, [tasks]);

  const [scheduleActive, setScheduleActive] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => setScheduleActive(!!(e as CustomEvent).detail);
    window.addEventListener("schedule-active-change", handler);
    return () => window.removeEventListener("schedule-active-change", handler);
  }, []);

  const [flow, setFlow] = useState<SerpentFlowDayState>(loadFlowState);
  useEffect(() => onFlowStateChange(setFlow), []);
  const [phaseTogglesVisible, setPhaseTogglesVisible] = useState<boolean>(loadPhaseToggleVisible);
  useEffect(() => onPhaseToggleVisibleChange(setPhaseTogglesVisible), []);

  const phase = scheduleActive ? "action" : flow.phase;
  const trio = [
    { ok: flow.startCompleted, label: "S" },
    { ok: flow.middayCompleted, label: "M" },
    { ok: flow.eveningCompleted, label: "E" },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 flex-shrink-0">
        {/* Serpent phase band */}
        <div className="relative h-24 sm:h-28 overflow-hidden bg-serpent">
          <img
            src={serpentBg}
            alt=""
            aria-hidden
            className={`pointer-events-none absolute inset-0 w-full h-full object-cover object-center transition-all duration-[1200ms] ease-out ${
              phase === "action" || phase === "review" ? "opacity-0 scale-105" : "opacity-60 scale-100"
            }`}
          />
          <img
            src={serpentStrike}
            alt=""
            aria-hidden
            className={`pointer-events-none absolute inset-0 w-full h-full object-cover object-center transition-all duration-[1400ms] ease-out ${
              phase === "action" ? "opacity-75 scale-110" : "opacity-0 scale-100"
            }`}
          />
          <img
            src={serpentSleep}
            alt=""
            aria-hidden
            className={`pointer-events-none absolute inset-0 w-full h-full object-cover object-center transition-all duration-[1400ms] ease-out ${
              phase === "review" ? "opacity-70 scale-100" : "opacity-0 scale-105"
            }`}
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-serpent/45" />

          <div className="relative h-full mx-auto max-w-[1400px] px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-baseline gap-3 min-w-0 flex-shrink">
              <span
                className="text-serpent-foreground leading-tight whitespace-nowrap text-[1.75rem] sm:text-[2.25rem]"
                style={{ fontFamily: "'Great Vibes', 'Allura', cursive", textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
              >
                Serpent List
              </span>
              <span className="hidden sm:inline text-[11px] font-mono tracking-wide text-serpent-foreground/75">
                {taskCount} open
              </span>
            </div>


            <div className="flex items-center gap-2">
              {phaseTogglesVisible && (
                <div className="hidden md:flex items-center gap-1 mr-1">
                  {(["planning", "action", "review"] as const).map((p) => {
                    const isOn = phase === p;
                    return (
                      <button
                        key={p}
                        onClick={() => window.dispatchEvent(new CustomEvent("serpent-set-phase", { detail: isOn ? null : p }))}
                        title={`Force phase: ${phaseLabel(p)}${isOn ? " (click to clear)" : ""}`}
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition ${
                          isOn
                            ? "bg-serpent-foreground/25 border-serpent-foreground/60 text-serpent-foreground"
                            : "bg-serpent-foreground/5 border-serpent-foreground/20 text-serpent-foreground/55 hover:text-serpent-foreground"
                        }`}
                      >
                        {p === "planning" ? "Plan" : p === "action" ? "Act" : "Review"}
                      </button>
                    );
                  })}
                </div>
              )}

              <div
                className="hidden sm:flex items-center gap-1 rounded-full bg-serpent-foreground/10 px-2 py-1"
                title={`Serpent flow today (Start ${flow.startCompleted ? "✓" : "·"} · Midday ${flow.middayCompleted ? "✓" : "·"} · Evening ${flow.eveningCompleted ? "✓" : "·"})`}
              >
                {trio.map((d, i) => (
                  <span
                    key={i}
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border ${
                      d.ok
                        ? "bg-emerald-500 border-emerald-300 text-white"
                        : "bg-transparent border-serpent-foreground/35 text-serpent-foreground/60"
                    }`}
                  >
                    {d.ok ? "✓" : d.label}
                  </span>
                ))}
              </div>

              <button
                onClick={() => onChange("consistency")}
                title={`Pride ${pride} · ${streak}-day streak`}
                className="hidden sm:flex items-center gap-2 rounded-full bg-serpent-foreground/10 hover:bg-serpent-foreground/20 px-3 py-1 transition-colors"
              >
                <span className="flex items-center gap-1 text-serpent-foreground">
                  <Trophy size={14} className="text-amber-300" strokeWidth={2.25} />
                  <span className="text-xs font-semibold tabular-nums">{pride}</span>
                </span>
                <span className="flex items-center gap-1 text-serpent-foreground">
                  <Flame size={14} className="text-orange-400" strokeWidth={2.25} />
                  <span className="text-xs font-semibold tabular-nums">{streak}</span>
                </span>
              </button>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  title="Settings"
                  className="p-2 rounded-full text-serpent-foreground/85 hover:text-serpent-foreground hover:bg-serpent-foreground/15 transition-colors"
                >
                  <Settings size={18} strokeWidth={1.9} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
                      {user && (
                        <p className="px-3 py-2 text-[11px] font-mono truncate text-muted-foreground border-b border-border" title={user.email ?? ""}>
                          {user.email}
                        </p>
                      )}
                      {[
                        { icon: Users, label: "Household", fn: () => setShowHousehold(true) },
                        { icon: Clock, label: "Flow times", fn: () => setShowFlowTimes(true) },
                        { icon: Mail, label: "Reminders & emails", fn: () => setShowNotifs(true) },
                      ].map(({ icon: Icon, label, fn }) => (
                        <button
                          key={label}
                          onClick={() => { fn(); setMenuOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-popover-foreground hover:bg-accent/10 transition-colors"
                        >
                          <Icon size={15} strokeWidth={1.8} className="text-muted-foreground" />
                          {label}
                        </button>
                      ))}
                      <button
                        onClick={() => { setMenuOpen(false); signOut(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t border-border"
                      >
                        <LogOut size={15} strokeWidth={1.8} />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setMobileNav((v) => !v)}
                className="md:hidden p-2 rounded-full text-serpent-foreground hover:bg-serpent-foreground/15"
                title="Menu"
              >
                {mobileNav ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Nav row */}
        <nav className="border-b border-border bg-background/85 backdrop-blur-md">
          <div className={`mx-auto max-w-[1400px] px-3 gap-1 ${mobileNav ? "flex flex-col py-2" : "hidden"} md:flex md:flex-row md:items-center md:py-1.5 md:overflow-x-auto scrollbar-thin`}>
            {NAV_ITEMS.map(({ mode, icon: Icon, label }) => {
              const isActive = active === mode;
              return (
                <button
                  key={mode}
                  data-tour={`nav-${mode}`}
                  onClick={() => { onChange(mode); setMobileNav(false); }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon size={16} strokeWidth={isActive ? 2.4 : 2} />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {showHousehold && <HouseholdSettings onClose={() => setShowHousehold(false)} />}
      {showFlowTimes && <FlowCutoffSettings onClose={() => setShowFlowTimes(false)} />}
      {showNotifs && <NotificationSettingsModal onClose={() => setShowNotifs(false)} />}
    </>
  );
}
