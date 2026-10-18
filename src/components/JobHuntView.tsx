import { useEffect, useMemo, useState, DragEvent } from "react";
import { withJobStage } from "@/lib/jobHuntActions";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { useCloudState } from "@/hooks/useCloudState";
import {
  Plus, Trash2, ExternalLink, X, BarChart3, Columns3, ListTodo, Briefcase, LayoutDashboard, Table2,
  Users, Building2, MessagesSquare, FileText, Star, Target, CalendarClock, Search,
} from "lucide-react";
import { Project, Task } from "@/lib/types";

export interface JobStageEntry { stage: string; date: string }
export interface JobCard {
  id: string;
  company: string;
  role: string;
  link?: string;
  location?: string;
  workMode?: "remote" | "hybrid" | "onsite";
  jobType?: "full-time" | "part-time" | "contract" | "internship";
  salary?: string;
  source?: string;
  contact?: string;
  contactId?: string;
  resumeId?: string;
  excitement?: number; // 1-5
  fit?: number; // 1-5
  notes?: string;
  priority?: "high" | "medium" | "low";
  stage: string;
  history: JobStageEntry[];
  appliedDate?: string;
  followUpDate?: string;
  nextStep?: string;
  nextStepDate?: string;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
}
interface Contact { id: string; name: string; company?: string; title?: string; email?: string; linkedin?: string; relation?: string; status?: string; lastContact?: string; nextFollowUp?: string; notes?: string }
interface Interview { id: string; jobId?: string; date?: string; round?: string; type?: string; interviewer?: string; prep?: string; questions?: string; reflection?: string; rating?: number; thankYouSent?: boolean }
interface Company { id: string; name: string; industry?: string; size?: string; website?: string; status?: string; why?: string; culture?: string; rating?: number }
interface Resume { id: string; name: string; kind?: string; link?: string; version?: string; notes?: string }
interface Goals { appsPerWeek: number; networkPerWeek: number; targetDate?: string; targetRole?: string; targetSalary?: string }

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
const addDays = (d: string, n: number) => new Date(new Date(d).getTime() + n * DAY).toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const ENDED = ["closed", "accepted"];
const inp = "w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

type Mode = "dashboard" | "table" | "board" | "gantt" | "interviews" | "contacts" | "companies" | "resumes";
const MODES: { id: Mode; label: string; icon: typeof Briefcase }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "table", label: "Applications", icon: Table2 },
  { id: "board", label: "Board", icon: Columns3 },
  { id: "gantt", label: "Timeline", icon: BarChart3 },
  { id: "interviews", label: "Interviews", icon: MessagesSquare },
  { id: "contacts", label: "Networking", icon: Users },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "resumes", label: "Resumes", icon: FileText },
];

interface Props { tasks: Task[]; onSaveTasks: (t: Task[]) => void; projects: Project[] }

function Stars({ value, onChange }: { value?: number; onChange?: (n: number) => void }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={12} onClick={onChange ? (e) => { e.stopPropagation(); onChange(n === value ? 0 : n); } : undefined}
          className={`${(value || 0) >= n ? "fill-primary text-primary" : "text-muted-foreground/40"} ${onChange ? "cursor-pointer" : ""}`} />
      ))}
    </span>
  );
}

export default function JobHuntView({ tasks, onSaveTasks, projects }: Props) {
  const [cards, setCards] = useCloudState<JobCard[]>(CLOUD_KEYS.jobs, []);
  const [contacts, setContacts] = useCloudState<Contact[]>(CLOUD_KEYS.jobContacts, []);
  const [interviews, setInterviews] = useCloudState<Interview[]>(CLOUD_KEYS.jobInterviews, []);
  const [companies, setCompanies] = useCloudState<Company[]>(CLOUD_KEYS.jobCompanies, []);
  const [resumes, setResumes] = useCloudState<Resume[]>(CLOUD_KEYS.jobResumes, []);
  const [goals, setGoals] = useCloudState<Goals>(CLOUD_KEYS.jobGoals, { appsPerWeek: 10, networkPerWeek: 5 });
  const [mode, setMode] = useState<Mode>("dashboard");
  const [editing, setEditing] = useState<JobCard | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hideClosed, setHideClosed] = useState(false);
  const [rangeDays, setRangeDays] = useState(60);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sort, setSort] = useState<"updated" | "excitement" | "nextStep" | "company">("updated");

  const jobProject = projects.find((p) => /job/i.test(p.name));

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      const setters: Record<string, (value: any) => void> = {
        [CLOUD_KEYS.jobs]: setCards, [CLOUD_KEYS.jobContacts]: setContacts,
        [CLOUD_KEYS.jobInterviews]: setInterviews, [CLOUD_KEYS.jobCompanies]: setCompanies,
        [CLOUD_KEYS.jobResumes]: setResumes, [CLOUD_KEYS.jobGoals]: setGoals,
      };
      if (!event.key || !setters[event.key]) return;
      const raw = localStorage.getItem(event.key);
      if (!raw) return;
      try { setters[event.key](JSON.parse(raw)); } catch { /* Ignore invalid cache. */ }
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [setCards, setContacts, setInterviews, setCompanies, setResumes, setGoals]);

  const withStage = (x: JobCard, stage: string): JobCard => {
    return withJobStage(x, stage);
  };
  const add = (stage = "wishlist") => {
    const now = new Date().toISOString();
    const c: JobCard = { id: uid(), company: "", role: "", stage, priority: "medium", history: [{ stage, date: today() }], createdAt: now, updatedAt: now };
    setCards((p) => [...p, c]);
    setEditing(c);
  };
  const save = (c: JobCard) => {
    setCards((p) => p.map((x) => (x.id !== c.id ? x : { ...withStage({ ...c, stage: x.stage }, c.stage), ...(x.stage === c.stage ? { updatedAt: new Date().toISOString() } : {}) })));
    setEditing(null);
  };
  const remove = (id: string) => { setCards((p) => p.filter((x) => x.id !== id)); setEditing(null); };
  const moveTo = (id: string, stage: string) => setCards((p) => p.map((x) => (x.id === id ? withStage(x, stage) : x)));
  const patch = (id: string, v: Partial<JobCard>) => setCards((p) => p.map((x) => (x.id === id ? { ...x, ...v, updatedAt: new Date().toISOString() } : x)));

  const pushTask = (title: string, due?: string) => {
    const t: Task = { id: uid(), title, categories: ["J"], completed: false, createdAt: new Date().toISOString(), dueDate: due || undefined, projectId: jobProject?.id, duration: 30 };
    onSaveTasks([...tasks, t]);
    alert("Added to your tasks");
  };

  const stats = useMemo(() => {
    const weekAgo = addDays(today(), -7);
    const reached = (s: string) => cards.filter((c) => (c.history || []).some((h) => h.stage === s) || c.stage === s).length;
    const active = cards.filter((c) => !ENDED.includes(c.stage)).length;
    const appliedWeek = cards.filter((c) => (c.history || []).some((h) => h.stage === "applied" && h.date >= weekAgo)).length;
    const networkWeek = contacts.filter((c) => c.lastContact && c.lastContact >= weekAgo).length;
    const applied = reached("applied"), screening = reached("screening"), interview = reached("interview"), offer = reached("offer");
    const overdue = cards.filter((c) => c.nextStepDate && c.nextStepDate < today() && !ENDED.includes(c.stage)).length;
    const responseRate = applied ? Math.round((screening / applied) * 100) : 0;
    return { active, appliedWeek, networkWeek, applied, screening, interview, offer, overdue, responseRate };
  }, [cards, contacts]);

  const actionItems = useMemo(() => {
    const items: { label: string; date: string; kind: string; onClick: () => void }[] = [];
    cards.filter((c) => !ENDED.includes(c.stage)).forEach((c) => {
      if (c.nextStep && c.nextStepDate) items.push({ label: `${c.nextStep} — ${c.company}`, date: c.nextStepDate, kind: "Next step", onClick: () => setEditing(c) });
      if (c.stage === "applied" && c.followUpDate) items.push({ label: `Follow up — ${c.company}`, date: c.followUpDate, kind: "Follow-up", onClick: () => setEditing(c) });
      if (c.deadline && ["wishlist", "preparing"].includes(c.stage)) items.push({ label: `Apply by — ${c.company}`, date: c.deadline, kind: "Deadline", onClick: () => setEditing(c) });
    });
    contacts.forEach((c) => c.nextFollowUp && items.push({ label: `Reach out — ${c.name}`, date: c.nextFollowUp, kind: "Networking", onClick: () => setMode("contacts") }));
    interviews.filter((i) => i.date && i.date >= today()).forEach((i) => {
      const j = cards.find((c) => c.id === i.jobId);
      items.push({ label: `${i.round || "Interview"} — ${j?.company || ""}`, date: i.date!, kind: "Interview", onClick: () => setMode("interviews") });
    });
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
  }, [cards, contacts, interviews]);

  const filtered = useMemo(() => {
    let l = cards.filter((c) => (!hideClosed || c.stage !== "closed") && (stageFilter === "all" || c.stage === stageFilter));
    if (q) { const s = q.toLowerCase(); l = l.filter((c) => [c.company, c.role, c.location, c.notes, c.source].some((v) => v?.toLowerCase().includes(s))); }
    const by: Record<string, (a: JobCard, b: JobCard) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      excitement: (a, b) => (b.excitement || 0) - (a.excitement || 0),
      nextStep: (a, b) => (a.nextStepDate || "9999").localeCompare(b.nextStepDate || "9999"),
      company: (a, b) => a.company.localeCompare(b.company),
    };
    return [...l].sort(by[sort]);
  }, [cards, hideClosed, stageFilter, q, sort]);

  const rangeStart = new Date(Date.now() - Math.round(rangeDays * 0.6) * DAY); rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart.getTime() + rangeDays * DAY);
  const pct = (d: string | Date) => ((new Date(d).getTime() - rangeStart.getTime()) / (rangeDays * DAY)) * 100;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const ticks: Date[] = [];
  for (let d = new Date(rangeStart); d <= rangeEnd; d = new Date(d.getTime() + 7 * DAY)) ticks.push(d);

  const funnel = [["Applied", stats.applied], ["Screening", stats.screening], ["Interview", stats.interview], ["Offer", stats.offer]] as const;
  const maxF = Math.max(1, stats.applied);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Briefcase size={20} className="text-primary" /> Job Hunt Pipeline</h2>
          <p className="text-xs text-muted-foreground">Applications, interviews, networking, companies and resumes — all in one place.</p>
        </div>
        <button onClick={() => add()} className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm flex items-center gap-1"><Plus size={14} /> Application</button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setMode(id)} className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${mode === id ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {mode === "dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {([
              ["Active", stats.active], ["Applied total", stats.applied], ["Interviews", stats.interview], ["Offers", stats.offer],
              ["Response rate", `${stats.responseRate}%`], ["Overdue steps", stats.overdue], ["Contacts", contacts.length],
            ] as [string, number | string][]).map(([l, v]) => (
              <div key={l} className={`rounded-md border p-2 bg-card ${l === "Overdue steps" && (v as number) > 0 ? "border-destructive/50" : "border-border"}`}>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</p>
                <p className={`text-lg font-bold ${l === "Overdue steps" && (v as number) > 0 ? "text-destructive" : "text-foreground"}`}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-lg p-3 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground"><Target size={14} className="text-primary" /> Weekly goals</h3>
              {([["Applications", stats.appliedWeek, goals.appsPerWeek, "appsPerWeek"], ["Networking touches", stats.networkWeek, goals.networkPerWeek, "networkPerWeek"]] as const).map(([l, v, g, k]) => (
                <div key={l}>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>{l}</span>
                    <span>{v} / <input type="number" min={1} value={g} onChange={(e) => setGoals({ ...goals, [k]: +e.target.value || 1 })} className="w-10 bg-transparent text-foreground text-right" /></span></div>
                  <div className="h-2 bg-secondary rounded mt-1"><div className="h-2 bg-primary rounded" style={{ width: `${Math.min(100, (v / g) * 100)}%` }} /></div>
                </div>
              ))}
              <input className={inp} placeholder="Target role" value={goals.targetRole || ""} onChange={(e) => setGoals({ ...goals, targetRole: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inp} placeholder="Target salary" value={goals.targetSalary || ""} onChange={(e) => setGoals({ ...goals, targetSalary: e.target.value })} />
                <input type="date" title="Target start date" className={inp} value={goals.targetDate || ""} onChange={(e) => setGoals({ ...goals, targetDate: e.target.value })} />
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-3">
              <h3 className="text-sm font-semibold text-foreground mb-2">Conversion funnel</h3>
              <div className="space-y-2">
                {funnel.map(([l, v]) => (
                  <div key={l}>
                    <div className="flex justify-between text-xs text-muted-foreground"><span>{l}</span><span>{v}</span></div>
                    <div className="h-3 bg-secondary rounded"><div className="h-3 bg-primary/80 rounded" style={{ width: `${(v / maxF) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {JOB_STAGES.map((s) => { const n = cards.filter((c) => c.stage === s.id).length; return n ? (
                  <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded border border-border flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />{s.label} {n}</span>) : null; })}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground mb-2"><CalendarClock size={14} className="text-primary" /> Action items</h3>
              {actionItems.length === 0 && <p className="text-xs text-muted-foreground">Nothing scheduled. Add next steps, follow-ups or interviews.</p>}
              <div className="space-y-1">
                {actionItems.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs group">
                    <button onClick={a.onClick} className="flex-1 text-left min-w-0">
                      <span className={`font-mono mr-1.5 ${a.date < today() ? "text-destructive" : a.date === today() ? "text-primary" : "text-muted-foreground"}`}>{a.date.slice(5)}</span>
                      <span className="text-foreground truncate">{a.label}</span>
                      <span className="text-muted-foreground"> · {a.kind}</span>
                    </button>
                    <button title="Make it a task" onClick={() => pushTask(a.label, a.date)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary"><ListTodo size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-3">
            <h3 className="text-sm font-semibold text-foreground mb-2">Top opportunities</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {cards.filter((c) => !ENDED.includes(c.stage)).sort((a, b) => (b.excitement || 0) + (b.fit || 0) - (a.excitement || 0) - (a.fit || 0)).slice(0, 6).map((c) => (
                <button key={c.id} onClick={() => setEditing(c)} className="text-left border border-border rounded-md p-2 text-xs hover:border-primary" style={{ borderLeft: `3px solid ${stageMeta(c.stage).color}` }}>
                  <p className="font-medium text-foreground">{c.company || "Untitled"} <span className="text-muted-foreground font-normal">· {c.role}</span></p>
                  <p className="text-muted-foreground flex items-center gap-2">{stageMeta(c.stage).label} <Stars value={c.excitement} /></p>
                </button>
              ))}
              {cards.length === 0 && <p className="text-xs text-muted-foreground">Add your first application to get started.</p>}
            </div>
          </div>
        </div>
      )}

      {["table", "board", "gantt"].includes(mode) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <div className="relative"><Search size={12} className="absolute left-2 top-2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="bg-secondary border border-border rounded pl-6 pr-2 py-1 text-foreground" /></div>
          {mode !== "board" && (
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="bg-secondary border border-border rounded px-1 py-1">
              <option value="all">All stages</option>{JOB_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          )}
          {mode === "table" && (
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="bg-secondary border border-border rounded px-1 py-1">
              <option value="updated">Recently updated</option><option value="excitement">Excitement</option><option value="nextStep">Next step date</option><option value="company">Company A–Z</option>
            </select>
          )}
          <label className="flex items-center gap-1"><input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} /> Hide closed</label>
          {mode === "gantt" && (
            <select value={rangeDays} onChange={(e) => setRangeDays(+e.target.value)} className="bg-secondary border border-border rounded px-1 py-1">
              <option value={30}>30 days</option><option value={60}>60 days</option><option value={120}>4 months</option><option value={180}>6 months</option>
            </select>
          )}
        </div>
      )}

      {mode === "table" && (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="text-muted-foreground text-left border-b border-border">
              <tr>{["Company", "Role", "Stage", "Excitement", "Fit", "Mode", "Salary", "Source", "Applied", "Next step", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-secondary/40 cursor-pointer" onClick={() => setEditing(c)}>
                  <td className="px-2 py-1.5 font-medium text-foreground">{c.company || "Untitled"}{c.priority === "high" && " ★"}</td>
                  <td className="px-2 py-1.5 text-foreground">{c.role}</td>
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <select value={c.stage} onChange={(e) => moveTo(c.id, e.target.value)} className="bg-transparent rounded px-1 py-0.5 border" style={{ borderColor: stageMeta(c.stage).color, color: stageMeta(c.stage).color }}>
                      {JOB_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><Stars value={c.excitement} onChange={(n) => patch(c.id, { excitement: n })} /></td>
                  <td className="px-2 py-1.5"><Stars value={c.fit} onChange={(n) => patch(c.id, { fit: n })} /></td>
                  <td className="px-2 py-1.5 text-muted-foreground capitalize">{c.workMode}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{c.salary}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{c.source}</td>
                  <td className="px-2 py-1.5 text-muted-foreground font-mono">{c.appliedDate}</td>
                  <td className={`px-2 py-1.5 ${c.nextStepDate && c.nextStepDate < today() && !ENDED.includes(c.stage) ? "text-destructive" : "text-foreground"}`}>{c.nextStep}{c.nextStepDate && <span className="font-mono text-muted-foreground"> {c.nextStepDate.slice(5)}</span>}</td>
                  <td className="px-2 py-1.5">{c.link && <a href={c.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary"><ExternalLink size={12} /></a>}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={11} className="text-center text-muted-foreground py-8">No applications match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {mode === "gantt" && (
        <div className="bg-card border border-border rounded-lg p-3 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[180px_1fr] gap-2">
              <div />
              <div className="relative h-5 border-b border-border text-[9px] font-mono text-muted-foreground">
                {ticks.map((t, i) => <span key={i} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>{t.toLocaleDateString("en", { day: "numeric", month: "short" })}</span>)}
              </div>
            </div>
            {filtered.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">No applications yet — add your first one.</p>}
            {filtered.map((c) => {
              const hist = c.history?.length ? c.history : [{ stage: c.stage, date: c.createdAt.slice(0, 10) }];
              const ended = ENDED.includes(c.stage);
              const segs = hist.map((h, i) => {
                const end = hist[i + 1]?.date || (ended && i === hist.length - 1 ? addDays(h.date, 1) : today());
                return { ...h, end: end === h.date ? addDays(end, 1) : end };
              });
              const overdue = c.nextStepDate && c.nextStepDate < today() && !ended;
              const ivs = interviews.filter((i) => i.jobId === c.id && i.date);
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
                      return <div key={i} title={`${stageMeta(s.stage).label}: ${s.date}`} onClick={() => setEditing(c)} className="absolute top-1 bottom-1 cursor-pointer"
                        style={{ left: `${l}%`, width: `${Math.max(0.6, r - l)}%`, background: stageMeta(s.stage).color }} />;
                    })}
                    {ivs.map((iv) => pct(iv.date!) >= 0 && pct(iv.date!) <= 100 && (
                      <div key={iv.id} title={`${iv.round || "Interview"} · ${iv.date}`} className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 bg-primary border border-background z-20" style={{ left: `${pct(iv.date!)}%`, top: "7px" }} />
                    ))}
                    {c.nextStepDate && pct(c.nextStepDate) >= 0 && pct(c.nextStepDate) <= 100 && (
                      <div title={`Next: ${c.nextStep || "step"} · ${c.nextStepDate}`} className={`absolute w-2.5 h-2.5 rotate-45 -translate-x-1/2 border z-20 ${overdue ? "bg-destructive border-destructive" : "bg-background border-foreground"}`} style={{ left: `${pct(c.nextStepDate)}%`, top: "7px" }} />
                    )}
                    {c.deadline && pct(c.deadline) >= 0 && pct(c.deadline) <= 100 && (
                      <div title={`Deadline ${c.deadline}`} className="absolute top-0 bottom-0 w-0.5 bg-foreground" style={{ left: `${pct(c.deadline)}%` }} />
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground mt-2">◆ next step · ● interview · | deadline · red line = today.</p>
          </div>
        </div>
      )}

      {mode === "board" && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {JOB_STAGES.filter((s) => !hideClosed || s.id !== "closed").map((s) => {
            const col = filtered.filter((c) => c.stage === s.id);
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
                      className="bg-card border border-border rounded-md p-2 cursor-grab text-xs space-y-0.5" style={{ borderLeft: `3px solid ${s.color}` }}>
                      <p className="font-medium text-foreground">{c.company || "Untitled"}{c.priority === "high" && " ★"}</p>
                      <p className="text-muted-foreground">{c.role}</p>
                      <div className="flex items-center gap-2 text-muted-foreground">{c.excitement ? <Stars value={c.excitement} /> : null}{c.workMode && <span className="capitalize">{c.workMode}</span>}</div>
                      {c.nextStep && <p className={c.nextStepDate && c.nextStepDate < today() ? "text-destructive" : "text-primary"}>→ {c.nextStep}{c.nextStepDate && ` · ${c.nextStepDate.slice(5)}`}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === "interviews" && (
        <SimpleList<Interview>
          items={[...interviews].sort((a, b) => (b.date || "").localeCompare(a.date || ""))} setItems={setInterviews}
          blank={() => ({ id: uid(), date: today(), round: "Phone screen", type: "Video" })}
          title={(i) => `${cards.find((c) => c.id === i.jobId)?.company || "No application linked"} — ${i.round || "Interview"}`}
          subtitle={(i) => `${i.date || ""} · ${i.type || ""} ${i.interviewer ? `· with ${i.interviewer}` : ""} ${i.thankYouSent ? "· thank-you sent ✓" : ""}`}
          onTask={(i) => pushTask(`Prep: ${i.round || "interview"} — ${cards.find((c) => c.id === i.jobId)?.company || ""}`, i.date)}
          fields={(i, set) => (
            <>
              <select className={inp} value={i.jobId || ""} onChange={(e) => set({ jobId: e.target.value })}>
                <option value="">Link application…</option>{cards.map((c) => <option key={c.id} value={c.id}>{c.company} — {c.role}</option>)}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <input type="date" className={inp} value={i.date || ""} onChange={(e) => set({ date: e.target.value })} />
                <select className={inp} value={i.round || ""} onChange={(e) => set({ round: e.target.value })}>
                  {["Phone screen", "Recruiter", "Hiring manager", "Technical", "Case study", "Panel", "Final", "Other"].map((r) => <option key={r}>{r}</option>)}
                </select>
                <select className={inp} value={i.type || ""} onChange={(e) => set({ type: e.target.value })}>{["Video", "Phone", "On-site"].map((r) => <option key={r}>{r}</option>)}</select>
              </div>
              <input className={inp} placeholder="Interviewer(s)" value={i.interviewer || ""} onChange={(e) => set({ interviewer: e.target.value })} />
              <textarea className={inp} rows={3} placeholder="Prep: research, STAR stories, questions to ask" value={i.prep || ""} onChange={(e) => set({ prep: e.target.value })} />
              <textarea className={inp} rows={3} placeholder="Questions they asked" value={i.questions || ""} onChange={(e) => set({ questions: e.target.value })} />
              <textarea className={inp} rows={2} placeholder="Reflection: what went well, what to improve" value={i.reflection || ""} onChange={(e) => set({ reflection: e.target.value })} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-2">How it went <Stars value={i.rating} onChange={(n) => set({ rating: n })} /></span>
                <label className="flex items-center gap-1"><input type="checkbox" checked={!!i.thankYouSent} onChange={(e) => set({ thankYouSent: e.target.checked })} /> Thank-you sent</label>
              </div>
            </>
          )}
        />
      )}

      {mode === "contacts" && (
        <SimpleList<Contact>
          items={[...contacts].sort((a, b) => (a.nextFollowUp || "9999").localeCompare(b.nextFollowUp || "9999"))} setItems={setContacts}
          blank={() => ({ id: uid(), name: "", status: "To contact" })}
          title={(c) => `${c.name || "New contact"}${c.company ? ` — ${c.company}` : ""}`}
          subtitle={(c) => `${c.status || ""}${c.title ? ` · ${c.title}` : ""}${c.lastContact ? ` · last ${c.lastContact}` : ""}${c.nextFollowUp ? ` · follow up ${c.nextFollowUp}` : ""}`}
          overdue={(c) => !!c.nextFollowUp && c.nextFollowUp < today()}
          onTask={(c) => pushTask(`Reach out to ${c.name}${c.company ? ` (${c.company})` : ""}`, c.nextFollowUp)}
          fields={(c, set) => (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input className={inp} placeholder="Name" value={c.name} onChange={(e) => set({ name: e.target.value })} />
                <input className={inp} placeholder="Company" value={c.company || ""} onChange={(e) => set({ company: e.target.value })} />
                <input className={inp} placeholder="Title" value={c.title || ""} onChange={(e) => set({ title: e.target.value })} />
                <select className={inp} value={c.relation || ""} onChange={(e) => set({ relation: e.target.value })}>
                  <option value="">Relationship…</option>{["Recruiter", "Hiring manager", "Referral", "Alumni", "Friend", "Mentor", "Cold contact"].map((r) => <option key={r}>{r}</option>)}
                </select>
                <input className={inp} placeholder="Email" value={c.email || ""} onChange={(e) => set({ email: e.target.value })} />
                <input className={inp} placeholder="LinkedIn URL" value={c.linkedin || ""} onChange={(e) => set({ linkedin: e.target.value })} />
              </div>
              <select className={inp} value={c.status || ""} onChange={(e) => set({ status: e.target.value })}>
                {["To contact", "Reached out", "Replied", "Coffee chat booked", "Referred me", "Gone cold"].map((r) => <option key={r}>{r}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <label>Last contact<input type="date" className={inp} value={c.lastContact || ""} onChange={(e) => set({ lastContact: e.target.value })} /></label>
                <label>Next follow-up<input type="date" className={inp} value={c.nextFollowUp || ""} onChange={(e) => set({ nextFollowUp: e.target.value })} /></label>
              </div>
              <button onClick={() => set({ lastContact: today(), nextFollowUp: addDays(today(), 14) })} className="text-xs text-primary">Contacted today → follow up in 2 weeks</button>
              <textarea className={inp} rows={2} placeholder="Notes" value={c.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
            </>
          )}
        />
      )}

      {mode === "companies" && (
        <SimpleList<Company>
          items={[...companies].sort((a, b) => (b.rating || 0) - (a.rating || 0))} setItems={setCompanies}
          blank={() => ({ id: uid(), name: "", status: "Researching" })}
          title={(c) => `${c.name || "New company"} · ${cards.filter((j) => j.company.trim().toLowerCase() === c.name.trim().toLowerCase() && c.name).length} applications`}
          subtitle={(c) => `${c.status || ""}${c.industry ? ` · ${c.industry}` : ""}${c.size ? ` · ${c.size}` : ""}`}
          fields={(c, set) => (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input className={inp} placeholder="Company name" value={c.name} onChange={(e) => set({ name: e.target.value })} />
                <input className={inp} placeholder="Website" value={c.website || ""} onChange={(e) => set({ website: e.target.value })} />
                <input className={inp} placeholder="Industry" value={c.industry || ""} onChange={(e) => set({ industry: e.target.value })} />
                <select className={inp} value={c.size || ""} onChange={(e) => set({ size: e.target.value })}>
                  <option value="">Size…</option>{["Startup (<50)", "Scale-up (50–500)", "Mid (500–5k)", "Enterprise (5k+)"].map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <select className={inp} value={c.status || ""} onChange={(e) => set({ status: e.target.value })}>
                {["Researching", "Dream company", "Watching openings", "Applied", "Not a fit"].map((r) => <option key={r}>{r}</option>)}
              </select>
              <textarea className={inp} rows={2} placeholder="Why I want to work here" value={c.why || ""} onChange={(e) => set({ why: e.target.value })} />
              <textarea className={inp} rows={2} placeholder="Culture, values, Glassdoor notes" value={c.culture || ""} onChange={(e) => set({ culture: e.target.value })} />
              <span className="flex items-center gap-2 text-xs text-muted-foreground">Interest <Stars value={c.rating} onChange={(n) => set({ rating: n })} /></span>
            </>
          )}
        />
      )}

      {mode === "resumes" && (
        <SimpleList<Resume>
          items={resumes} setItems={setResumes}
          blank={() => ({ id: uid(), name: "", kind: "Resume", version: "v1" })}
          title={(r) => `${r.name || "Untitled"} · ${r.version || ""}`}
          subtitle={(r) => `${r.kind || ""} · used in ${cards.filter((c) => c.resumeId === r.id).length} applications`}
          fields={(r, set) => (
            <>
              <div className="grid grid-cols-3 gap-2">
                <input className={inp} placeholder="Name (e.g. Product Manager)" value={r.name} onChange={(e) => set({ name: e.target.value })} />
                <select className={inp} value={r.kind || ""} onChange={(e) => set({ kind: e.target.value })}>{["Resume", "Cover letter", "Portfolio"].map((k) => <option key={k}>{k}</option>)}</select>
                <input className={inp} placeholder="Version" value={r.version || ""} onChange={(e) => set({ version: e.target.value })} />
              </div>
              <input className={inp} placeholder="Link to document" value={r.link || ""} onChange={(e) => set({ link: e.target.value })} />
              <textarea className={inp} rows={2} placeholder="What's different in this version" value={r.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
            </>
          )}
        />
      )}

      {editing && <Editor card={editing} contacts={contacts} resumes={resumes} interviews={interviews.filter((i) => i.jobId === editing.id)}
        onClose={() => setEditing(null)} onSave={save} onDelete={remove}
        onPush={(c) => c.nextStep && pushTask(`${c.nextStep} — ${c.company || "Job"}${c.role ? ` (${c.role})` : ""}`, c.nextStepDate)}
        onAddInterview={(c) => { setInterviews((p) => [...p, { id: uid(), jobId: c.id, date: today(), round: "Phone screen", type: "Video" }]); setEditing(null); setMode("interviews"); }} />}
    </div>
  );
}

function SimpleList<T extends { id: string }>({ items, setItems, blank, title, subtitle, fields, onTask, overdue }: {
  items: T[]; setItems: (f: (p: T[]) => T[]) => void; blank: () => T; title: (t: T) => string; subtitle: (t: T) => string;
  fields: (t: T, set: (v: Partial<T>) => void) => React.ReactNode; onTask?: (t: T) => void; overdue?: (t: T) => boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (id: string) => (v: Partial<T>) => setItems((p) => p.map((x) => (x.id === id ? { ...x, ...v } : x)));
  return (
    <div className="space-y-2">
      <button onClick={() => { const b = blank(); setItems((p) => [b, ...p]); setOpen(b.id); }} className="text-sm text-primary flex items-center gap-1"><Plus size={14} /> Add</button>
      {items.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nothing here yet.</p>}
      {items.map((it) => (
        <div key={it.id} className={`bg-card border rounded-lg ${overdue?.(it) ? "border-destructive/50" : "border-border"}`}>
          <div className="flex items-center gap-2 p-2 cursor-pointer" onClick={() => setOpen(open === it.id ? null : it.id)}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{title(it)}</p>
              <p className={`text-xs truncate ${overdue?.(it) ? "text-destructive" : "text-muted-foreground"}`}>{subtitle(it)}</p>
            </div>
            {onTask && <button title="Make it a task" onClick={(e) => { e.stopPropagation(); onTask(it); }} className="text-muted-foreground hover:text-primary"><ListTodo size={14} /></button>}
            <button title="Delete" onClick={(e) => { e.stopPropagation(); if (confirm("Delete?")) setItems((p) => p.filter((x) => x.id !== it.id)); }} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
          </div>
          {open === it.id && <div className="p-3 pt-0 space-y-2">{fields(it, set(it.id))}</div>}
        </div>
      ))}
    </div>
  );
}

function Editor({ card, contacts, resumes, interviews, onClose, onSave, onDelete, onPush, onAddInterview }: {
  card: JobCard; contacts: Contact[]; resumes: Resume[]; interviews: Interview[]; onClose: () => void; onSave: (c: JobCard) => void;
  onDelete: (id: string) => void; onPush: (c: JobCard) => void; onAddInterview: (c: JobCard) => void;
}) {
  const [c, setC] = useState<JobCard>(card);
  const f = (k: keyof JobCard) => (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center"><h3 className="font-semibold text-foreground">Application</h3><button onClick={onClose}><X size={16} /></button></div>
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} placeholder="Company" value={c.company} onChange={f("company")} autoFocus />
          <input className={inp} placeholder="Role" value={c.role} onChange={f("role")} />
          <input className={inp} placeholder="Location" value={c.location || ""} onChange={f("location")} />
          <select className={inp} value={c.workMode || ""} onChange={f("workMode")}><option value="">Work mode…</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select>
          <select className={inp} value={c.jobType || ""} onChange={f("jobType")}><option value="">Job type…</option><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option></select>
          <input className={inp} placeholder="Salary range" value={c.salary || ""} onChange={f("salary")} />
          <select className={inp} value={c.source || ""} onChange={f("source")}><option value="">Source…</option>{["LinkedIn", "Company site", "Referral", "Recruiter", "Indeed", "Job board", "Networking event", "Other"].map((s) => <option key={s}>{s}</option>)}</select>
          <select className={inp} value={c.priority} onChange={f("priority")}><option value="high">High priority</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <select className={inp} value={c.contactId || ""} onChange={f("contactId")}><option value="">Linked contact…</option>{contacts.map((x) => <option key={x.id} value={x.id}>{x.name}{x.company ? ` (${x.company})` : ""}</option>)}</select>
          <select className={inp} value={c.resumeId || ""} onChange={f("resumeId")}><option value="">Resume used…</option>{resumes.map((x) => <option key={x.id} value={x.id}>{x.name} {x.version}</option>)}</select>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">Excitement <Stars value={c.excitement} onChange={(n) => setC({ ...c, excitement: n })} /></span>
          <span className="flex items-center gap-1">Fit <Stars value={c.fit} onChange={(n) => setC({ ...c, fit: n })} /></span>
        </div>
        <div className="flex gap-2">
          <input className={inp} placeholder="Job posting link" value={c.link || ""} onChange={f("link")} />
          {c.link && <a href={c.link} target="_blank" rel="noreferrer" className="p-2 text-primary"><ExternalLink size={16} /></a>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
          <label>Stage<select className={inp} value={c.stage} onChange={f("stage")}>{JOB_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label>Applied<input type="date" className={inp} value={c.appliedDate || ""} onChange={f("appliedDate")} /></label>
          <label>Follow up<input type="date" className={inp} value={c.followUpDate || ""} onChange={f("followUpDate")} /></label>
          <label>Apply by<input type="date" className={inp} value={c.deadline || ""} onChange={f("deadline")} /></label>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input className={inp} placeholder="Next step (e.g. send follow-up)" value={c.nextStep || ""} onChange={f("nextStep")} />
          <input type="date" className={inp} value={c.nextStepDate || ""} onChange={f("nextStepDate")} />
        </div>
        <textarea className={inp} rows={3} placeholder="Notes, job description highlights, why it fits" value={c.notes || ""} onChange={f("notes")} />
        {interviews.length > 0 && <div className="text-[11px] text-muted-foreground">Interviews: {interviews.map((i) => `${i.round} (${i.date})`).join(" · ")}</div>}
        {(c.history || []).length > 0 && <div className="text-[11px] text-muted-foreground">History: {(c.history || []).map((h) => `${stageMeta(h.stage).label} (${h.date})`).join(" → ")}</div>}
        <div className="flex justify-between pt-2 gap-2 flex-wrap">
          <button onClick={() => onDelete(c.id)} className="text-destructive text-sm flex items-center gap-1"><Trash2 size={14} /> Delete</button>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onAddInterview(c)} className="border border-border px-3 py-1.5 rounded text-sm flex items-center gap-1"><MessagesSquare size={14} /> Log interview</button>
            <button disabled={!c.nextStep} onClick={() => onPush(c)} className="border border-border px-3 py-1.5 rounded text-sm flex items-center gap-1 disabled:opacity-40"><ListTodo size={14} /> Next step → task</button>
            <button onClick={() => onSave(c)} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
