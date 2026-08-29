import { useMemo, useState } from "react";
import { Bot, AudioLines, MessageSquare, Bell, ChevronUp, ChevronDown, X, Compass, Lightbulb, Trophy, AlertTriangle } from "lucide-react";
import { Task, Project, Reminder, LifePlanProject, DailyScheduleSlot } from "@/lib/types";
import AIChat from "./AIChat";
import VoiceAssistant from "./VoiceAssistant";
import SerpentFlow from "./SerpentFlow";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { Habit } from "@/lib/habits";
import { buildOrgTips } from "@/lib/orgTips";
import { computeGame, buildConsistencyNudges } from "@/lib/consistencyGame";

interface Props {
  tasks: Task[];
  projects: Project[];
  onSaveTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onSaveProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  reminders?: Reminder[];
  lifePlanProjects?: LifePlanProject[];
  dailySchedule?: DailyScheduleSlot[];
}

type Panel = "flow" | "voice" | "chat" | "tips" | "consistency" | "notifications" | null;

export default function AssistantBar({ tasks, projects, onSaveTasks, onSaveProjects, reminders = [], lifePlanProjects = [], dailySchedule = [] }: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const { notifications, dismiss, dismissAll } = useAssignmentNotifications(tasks);
  const [habits] = useCloudState<Habit[]>(CLOUD_KEYS.habits, []);
  const tips = useMemo(() => buildOrgTips(tasks, habits || []), [tasks, habits]);
  const game = useMemo(() => computeGame(habits || []), [habits]);
  const nudges = useMemo(() => buildConsistencyNudges(habits || [], game), [habits, game]);
  const consistencyOpen = game.today.due - game.today.completed;


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
        <div className={panel ? "mx-auto max-w-[1400px] px-3 pt-2" : "hidden"}>
          <div className="h-[min(52vh,460px)] rounded-t-xl border border-b-0 border-border bg-card overflow-hidden">
            {/* Always mounted: the Serpent flow drives phase state and step highlights */}
            <div className={panel === "flow" ? "h-full" : "hidden"}>
              <SerpentFlow
                tasks={tasks}
                reminders={reminders}
                lifePlanProjects={lifePlanProjects}
                dailySchedule={dailySchedule}
                embedded
              />
            </div>
            {panel === "voice" && (
              <VoiceAssistant tasks={tasks} projects={projects} onSaveTasks={onSaveTasks} onSaveProjects={onSaveProjects} />
            )}
            {panel === "chat" && (
              <AIChat tasks={tasks} projects={projects} onSaveTasks={onSaveTasks} onSaveProjects={onSaveProjects} />
            )}
            {panel === "tips" && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-sm font-semibold text-foreground">Organization tips</span>
                  <span className="text-xs text-muted-foreground">Based on how you've been using the system</span>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
                  {tips.map((t) => (
                    <div
                      key={t.id}
                      className={`rounded-lg border px-3 py-2.5 ${
                        t.severity === "warn"
                          ? "border-amber-500/40 bg-amber-500/5"
                          : t.severity === "good"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Lightbulb size={14} className={t.severity === "warn" ? "text-amber-600" : t.severity === "good" ? "text-emerald-600" : "text-primary"} />
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t.detail}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-1.5">{t.principle}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {panel === "consistency" && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-sm font-semibold text-foreground">Consistency game</span>
                  <span className="font-mono text-xs text-primary">
                    {game.points.toLocaleString()} pts · ×{game.multiplier.toFixed(2)}
                  </span>
                </div>
                <div className="px-4 py-3 border-b border-border">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                    <span>Level {game.level} · {game.levelName}</span>
                    <span className="font-mono">{Math.round(game.progress * 100)}% to reward</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-cat-h" style={{ width: `${Math.round(game.progress * 100)}%` }} />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
                  {nudges.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-lg border px-3 py-2.5 ${
                        n.tone === "warn"
                          ? "border-amber-500/40 bg-amber-500/5"
                          : n.tone === "good"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Trophy size={14} className={n.tone === "warn" ? "text-amber-600" : n.tone === "good" ? "text-emerald-600" : "text-primary"} />
                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{n.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {panel === "notifications" && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-sm font-semibold text-foreground">
                    Notifications
                    {overdueCount > 0 && (
                      <span className="ml-2 text-xs font-medium text-destructive">{overdueCount} overdue</span>
                    )}
                  </span>
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
                      <div
                        key={n.id}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                          n.severity === "overdue"
                            ? "border-destructive/40 bg-destructive/5"
                            : n.severity === "warn"
                            ? "border-amber-500/40 bg-amber-500/5"
                            : "border-border bg-background"
                        }`}
                      >
                        {n.severity === "info" ? (
                          <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
                        ) : (
                          <AlertTriangle
                            size={14}
                            className={`mt-0.5 flex-shrink-0 ${n.severity === "overdue" ? "text-destructive" : "text-amber-600"}`}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{n.label}</p>
                          {n.detail && <p className="text-xs text-muted-foreground truncate">{n.detail}</p>}
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-0.5">{n.kind}</p>
                        </div>
                        <button onClick={() => dismiss(n.id)} className="text-muted-foreground hover:text-foreground p-1" title="Dismiss">
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


        <div className="mx-auto max-w-[1400px] px-3 h-14 flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground pr-1">
            <Bot size={17} className="text-primary" />
            <span className="hidden md:inline">Assistant</span>
          </div>

          {tabBtn("flow", Compass, "Flow")}
          {tabBtn("voice", AudioLines, "Voice")}
          {tabBtn("chat", MessageSquare, "Chat")}
          {tabBtn("tips", Lightbulb, "Tips")}

          <button
            onClick={() => toggle("consistency")}
            title="Consistency game"
            className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              panel === "consistency" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <Trophy size={16} />
            <span className="hidden sm:inline">Game</span>
            {consistencyOpen > 0 && (
              <span
                className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-amber-500 text-white ${
                  new Date().getHours() >= 20 ? "animate-pulse" : ""
                }`}
              >
                {consistencyOpen}
              </span>
            )}
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

    </>
  );
}
