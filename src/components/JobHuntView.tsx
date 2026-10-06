import { useMemo, useState, DragEvent } from "react";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { useCloudState } from "@/hooks/useCloudState";
import { Plus, Trash2, ExternalLink, X, BarChart3, Columns3, ListTodo, Briefcase } from "lucide-react";
import { Project, Task } from "@/lib/types";

export interface JobStageEntry { stage: string; date: string }
export interface JobCard {
  id: string;
  company: string;
  role: string;
  link?: string;
  location?: string;
  salary?: string;
  contact?: string;
  notes?: string;
  priority?: "high" | "medium" | "low";
  stage: string;
  history: JobStageEntry[];
  nextStep?: string;
  nextStepDate?: string;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
}

export const JOB_STAGES = [
  { id: "wishlist", label: "Wishlist", color: "hsl(220 60% 55%)" },
  { id: "preparing", label: "Preparing", color: "hsl(260 55% 58%)" },
  { id: "applied", label: "Applied", color: "hsl(200 75% 48%)" },
  { id: "screening", label: "Screening", color: "hsl(35 90% 52%)" },
  { id: "interview", label: "Interviewing", color: "hsl(15 85% 55%)" },
  { id: "offer", label: "Offer", color: "hsl(140 60% 42%)" },
  { id: "accepted", label: "Accepted", color: "hsl(160 70% 35%)" },
  { id: "closed", label: "Rejected / Withdrawn", color: "hsl(0 0% 55%)" },
];
const stageMeta = (id: string) => JOB_STAGES.find((s) => s.id === id) || JOB_STAGES[0];
const DAY = 86400000;
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

interface Props { tasks: Task[]; onSaveTasks: (t: Task[]) => void; projects: Project[] }

export default function JobHuntView({ tasks, onSaveTasks, projects }: Props) {
  const [cards, setCards] = useCloudState<JobCard[]>(CLOUD_KEYS.jobs, []);
  const [mode, setMode] = useState<"gantt" | "pipeline">("gantt");
  const [editing, setEditing] = useState<JobCard | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hideClosed, setHideClosed] = useState(false);
  const [rangeDays, setRangeDays] = useState(60);

  const jobProject = projects.find((p) => /job/i.test(p.name));

  const add = (stage = "wishlist") => {
    const now = new Date().toISOString();
    const c: JobCard = { id: uid(), company: "", role: "", stage, priority: "medium", history: [{ stage, date: today() }], createdAt: now, updatedAt: now };
    setCards((p) => [...p, c]);
    setEditing(c);
  };
  const save = (c: JobCard) => {
    setCards((p) => p.map((x) => {
      if (x.id !== c.id) return x;
      const history = x.stage !== c.stage ? [...(c.history || []), { stage: c.stage, date: today() }] : c.history;
      return { ...c, history, updatedAt: new Date().toISOString() };
    }));
    setEditing(null);
  };
  const remove = (id: string) => { setCards((p) => p.filter((x) => x.id !== id)); setEditing(null); };
  const moveTo = (id: string, stage: string) =>
    setCards((p) => p.map((x) => x.id === id && x.stage !== stage
      ? { ...x, stage, history: [...(x.history || []), { stage, date: today() }], updatedAt: new Date().toISOString() } : x));

  const pushTask = (c: JobCard) => {
    if (!c.nextStep) return;
    const t: Task = {
      id: uid(), title: `${c.nextStep} — ${c.company || "Job"}${c.role ? ` (${c.role})` : ""}`,
      categories: ["J"], completed: false, createdAt: new Date().toISOString(),
      dueDate: c.nextStepDate || undefined, projectId: jobProject?.id, duration: 30,
    };
    onSaveTasks([...tasks, t]);
    alert("Added to your tasks");
  };

  const visible = cards.filter((c) => !hideClosed || c.stage !== "closed");
  const stats = useMemo(() => {
    const active = cards.filter((c) => !["closed", "accepted"].includes(c.stage)).length;
    const applied = cards.filter((c) => (c.history || []).some((h) => h.stage === "applied")).length;
    const interviews = cards.filter((c) => (c.history || []).some((h) => h.stage === "interview")).length;
    const offers = cards.filter((c) => (c.history || []).some((h) => h.stage === "offer")).length;
    const overdue = cards.filter((c) => c.nextStepDate && c.nextStepDate < today() && !["closed", "accepted"].includes(c.stage)).length;
    return { active, applied, interviews, offers, overdue };
  }, [cards]);

  // Gantt range
  const rangeStart = new Date(Date.now() - Math.round(rangeDays * 0.6) * DAY); rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart.getTime() + rangeDays * DAY);
  const pct = (d: string | Date) => ((new Date(d).getTime() - rangeStart.getTime()) / (rangeDays * DAY)) * 100;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const ticks: Date[] = [];
  for (let d = new Date(rangeStart); d <= rangeEnd; d = new Date(d.getTime() + 7 * DAY)) ticks.push(d);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Briefcase size={20} className="text-primary" /> Job Hunt Pipeline</h2>
          <p className="text-xs text-muted-foreground">Track every application from wishlist to offer.</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            <button onClick={() => setMode("gantt")} className={`px-3 py-1.5 flex items-center gap-1 ${mode === "gantt" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><BarChart3 size={14} /> Gantt</button>
            <button onClick={() => setMode("pipeline")} className={`px-3 py-1.5 flex items-center gap-1 ${mode === "pipeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Columns3 size={14} /> Pipeline</button>
          </div>
          <button onClick={() => add()} className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm flex items-center gap-1"><Plus size={14} /> Application</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[["Active", stats.active], ["Applied", stats.applied], ["Interviews", stats.interviews], ["Offers", stats.offers], ["Overdue steps", stats.overdue]].map(([l, v]) => (
          <div key={l as string} className={`rounded-md border p-2 bg-card ${l === "Overdue steps" && (v as number) > 0 ? "border-destructive/50" : "border-border"}`}>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</p>
            <p className={`text-lg font-bold ${l === "Overdue steps" && (v as number) > 0 ? "text-destructive" : "text-foreground"}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <label className="flex items-center gap-1"><input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} /> Hide closed</label>
        {mode === "gantt" && (
          <label className="flex items-center gap-1">Range
            <select value={rangeDays} onChange={(e) => setRangeDays(+e.target.value)} className="bg-secondary border border-border rounded px-1 py-0.5">
              <option value={30}>30 days</option><option value={60}>60 days</option><option value={120}>4 months</option><option value={180}>6 months</option>
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {JOB_STAGES.map((s) => <span key={s.id} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
        </div>
      </div>

      {mode === "gantt" ? (
        <div className="bg-card border border-border rounded-lg p-3 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[180px_1fr] gap-2">
              <div />
              <div className="relative h-5 border-b border-border text-[9px] font-mono text-muted-foreground">
                {ticks.map((t, i) => <span key={i} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>{t.toLocaleDateString("en", { day: "numeric", month: "short" })}</span>)}
              </div>
            </div>
            {visible.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No applications yet — add your first one.</p>}
            {visible.map((c) => {
              const hist = (c.history?.length ? c.history : [{ stage: c.stage, date: c.createdAt.slice(0, 10) }]);
              const ended = ["closed", "accepted"].includes(c.stage);
              const segs = hist.map((h, i) => {
                const end = hist[i + 1]?.date || (ended && i === hist.length - 1 ? new Date(new Date(h.date).getTime() + DAY).toISOString().slice(0, 10) : today());
                return { ...h, end: end === h.date ? new Date(new Date(end).getTime() + DAY).toISOString() : end };
              });
              const overdue = c.nextStepDate && c.nextStepDate < today() && !ended;
              return (
                <div key={c.id} className="grid grid-cols-[180px_1fr] gap-2 items-center py-1 border-b border-border/40">
                  <button onClick={() => setEditing(c)} className="text-left min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{c.company || "Untitled"}{c.priority === "high" && " ★"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{c.role} · {stageMeta(c.stage).label}</p>
                  </button>
                  <div className="relative h-6 bg-secondary/40 rounded">
                    <div className="absolute top-0 bottom-0 w-px bg-destructive/60 z-10" style={{ left: `${clamp(pct(new Date()))}%` }} />
                    {segs.map((s, i) => {
                      const l = clamp(pct(s.date)), r = clamp(pct(s.end));
                      if (r <= 0 || l >= 100) return null;
                      return <div key={i} title={`${stageMeta(s.stage).label}: ${s.date}`} onClick={() => setEditing(c)}
                        className="absolute top-1 bottom-1 cursor-pointer first:rounded-l last:rounded-r"
                        style={{ left: `${l}%`, width: `${Math.max(0.6, r - l)}%`, background: stageMeta(s.stage).color }} />;
                    })}
                    {c.nextStepDate && pct(c.nextStepDate) >= 0 && pct(c.nextStepDate) <= 100 && (
                      <div title={`Next: ${c.nextStep || "step"} · ${c.nextStepDate}`} className={`absolute top-0 w-2.5 h-2.5 rotate-45 -translate-x-1/2 border ${overdue ? "bg-destructive border-destructive" : "bg-background border-foreground"}`} style={{ left: `${pct(c.nextStepDate)}%`, top: "7px" }} />
                    )}
                    {c.deadline && pct(c.deadline) >= 0 && pct(c.deadline) <= 100 && (
                      <div title={`Deadline ${c.deadline}`} className="absolute top-0 bottom-0 w-0.5 bg-foreground" style={{ left: `${pct(c.deadline)}%` }} />
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground mt-2">◆ next step · | deadline · red line = today. Click a row to edit.</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {JOB_STAGES.filter((s) => !hideClosed || s.id !== "closed").map((s) => {
            const col = cards.filter((c) => c.stage === s.id);
            return (
              <div key={s.id} onDragOver={(e: DragEvent) => e.preventDefault()} onDrop={() => { if (dragId) moveTo(dragId, s.id); setDragId(null); }}
                className="w-56 flex-shrink-0 bg-secondary/40 rounded-lg p-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label} <span className="text-muted-foreground">{col.length}</span></span>
                  <button onClick={() => add(s.id)} className="text-muted-foreground hover:text-primary"><Plus size={14} /></button>
                </div>
                <div className="space-y-2 min-h-[60px]">
                  {col.map((c) => (
                    <div key={c.id} draggable onDragStart={() => setDragId(c.id)} onClick={() => setEditing(c)}
                      className="bg-card border border-border rounded-md p-2 cursor-grab text-xs" style={{ borderLeft: `3px solid ${s.color}` }}>
                      <p className="font-medium text-foreground">{c.company || "Untitled"}{c.priority === "high" && " ★"}</p>
                      <p className="text-muted-foreground">{c.role}</p>
                      {c.nextStep && <p className={`mt-1 ${c.nextStepDate && c.nextStepDate < today() ? "text-destructive" : "text-primary"}`}>→ {c.nextStep}{c.nextStepDate && ` · ${c.nextStepDate}`}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <Editor card={editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} onPush={pushTask} />}
    </div>
  );
}

function Editor({ card, onClose, onSave, onDelete, onPush }: { card: JobCard; onClose: () => void; onSave: (c: JobCard) => void; onDelete: (id: string) => void; onPush: (c: JobCard) => void }) {
  const [c, setC] = useState<JobCard>(card);
  const f = (k: keyof JobCard) => (e: any) => setC({ ...c, [k]: e.target.value });
  const inp = "w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center"><h3 className="font-semibold text-foreground">Application</h3><button onClick={onClose}><X size={16} /></button></div>
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} placeholder="Company" value={c.company} onChange={f("company")} autoFocus />
          <input className={inp} placeholder="Role" value={c.role} onChange={f("role")} />
          <input className={inp} placeholder="Location" value={c.location || ""} onChange={f("location")} />
          <input className={inp} placeholder="Salary" value={c.salary || ""} onChange={f("salary")} />
          <input className={inp} placeholder="Contact / recruiter" value={c.contact || ""} onChange={f("contact")} />
          <select className={inp} value={c.priority} onChange={f("priority")}><option value="high">High priority</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </div>
        <div className="flex gap-2">
          <input className={inp} placeholder="Job link" value={c.link || ""} onChange={f("link")} />
          {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="p-2 text-primary"><ExternalLink size={16} /></a>}
        </div>
        <label className="text-xs text-muted-foreground">Stage</label>
        <select className={inp} value={c.stage} onChange={f("stage")}>{JOB_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input className={inp} placeholder="Next step (e.g. send follow-up)" value={c.nextStep || ""} onChange={f("nextStep")} />
          <input type="date" className={inp} value={c.nextStepDate || ""} onChange={f("nextStepDate")} />
        </div>
        <label className="text-xs text-muted-foreground">Application deadline</label>
        <input type="date" className={inp} value={c.deadline || ""} onChange={f("deadline")} />
        <textarea className={inp} rows={3} placeholder="Notes" value={c.notes || ""} onChange={f("notes")} />
        {(c.history || []).length > 0 && (
          <div className="text-[11px] text-muted-foreground">History: {(c.history || []).map((h) => `${stageMeta(h.stage).label} (${h.date})`).join(" → ")}</div>
        )}
        <div className="flex justify-between pt-2 gap-2 flex-wrap">
          <button onClick={() => onDelete(c.id)} className="text-destructive text-sm flex items-center gap-1"><Trash2 size={14} /> Delete</button>
          <div className="flex gap-2">
            <button disabled={!c.nextStep} onClick={() => onPush(c)} className="border border-border px-3 py-1.5 rounded text-sm flex items-center gap-1 disabled:opacity-40"><ListTodo size={14} /> Next step → task</button>
            <button onClick={() => onSave(c)} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
