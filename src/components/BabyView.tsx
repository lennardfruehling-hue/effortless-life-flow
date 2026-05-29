import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Task, Project, ResearchNoteRow, TaskList } from "@/lib/types";
import { v4 as uuid } from "uuid";
import { format, parseISO, addDays, differenceInDays } from "date-fns";
import {
  Baby, Syringe, CalendarClock, Star, Heart, Ruler, ToyBrick,
  Gift, UtensilsCrossed, FileText, GraduationCap, Plus, Trash2,
  Link2, Upload, X, CheckSquare, Square, ExternalLink,
  Smile, Frown, Meh, Cake, Languages, Activity, AlertCircle, Clock,
} from "lucide-react";

// ---------------- Data shape ----------------

export type Sentiment = "positive" | "negative" | "neutral";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Language = "german" | "english" | "spanish";
export type ActivityKind = "play" | "language" | "music" | "motor" | "cognitive" | "social" | "creative";

interface BabyEntry {
  id: string;
  title: string;
  date?: string;
  time?: string;
  notes?: string;
  linkedNoteIds?: string[];
  // growth
  heightCm?: number;
  weightKg?: number;
  headCm?: number;
  // documents
  fileUrl?: string;
  filePath?: string;
  fileName?: string;
  fileType?: string;
  // smart fields
  sentiment?: Sentiment;
  mealType?: MealType;
  dayOfWeek?: number;
  nutrition?: string[];
  calories?: number;
  language?: Language;
  activityKind?: ActivityKind;
  durationMin?: number;
  vaccineKey?: string;
  administered?: boolean;
  doctor?: string;
  location?: string;
}

type SectionId =
  | "vaccines" | "appointments" | "milestones" | "health" | "growth"
  | "play" | "toys" | "food" | "documents" | "education";

interface BabyData {
  birthDate?: string;
  vaccines: BabyEntry[];
  appointments: BabyEntry[];
  milestones: BabyEntry[];
  health: BabyEntry[];
  growth: BabyEntry[];
  play: BabyEntry[];
  toys: { listId?: string | null };
  food: BabyEntry[];
  documents: BabyEntry[];
  education: BabyEntry[];
}

const DEFAULT_DATA: BabyData = {
  vaccines: [], appointments: [], milestones: [], health: [], growth: [],
  play: [], toys: { listId: null }, food: [], documents: [], education: [],
};

// ---------------- Reference data ----------------

/** WHO/EU-style core schedule (months from birth). Editable list. */
const VACCINE_SCHEDULE: { key: string; name: string; ageMonths: number; notes?: string }[] = [
  { key: "hepB-birth", name: "Hepatitis B (birth dose)", ageMonths: 0 },
  { key: "6in1-2m", name: "6-in-1 (DTaP-IPV-Hib-HepB) #1", ageMonths: 2 },
  { key: "pcv-2m", name: "Pneumococcal (PCV) #1", ageMonths: 2 },
  { key: "rota-2m", name: "Rotavirus #1", ageMonths: 2 },
  { key: "menB-2m", name: "Meningococcal B #1", ageMonths: 2 },
  { key: "6in1-4m", name: "6-in-1 #2", ageMonths: 4 },
  { key: "rota-4m", name: "Rotavirus #2", ageMonths: 4 },
  { key: "menB-4m", name: "Meningococcal B #2", ageMonths: 4 },
  { key: "6in1-6m", name: "6-in-1 #3", ageMonths: 6 },
  { key: "pcv-6m", name: "Pneumococcal (PCV) #2", ageMonths: 6 },
  { key: "menC-12m", name: "Meningococcal C", ageMonths: 12 },
  { key: "mmr-12m", name: "MMR #1", ageMonths: 12 },
  { key: "hib-13m", name: "Hib/MenC booster", ageMonths: 13 },
  { key: "pcv-13m", name: "PCV booster", ageMonths: 13 },
  { key: "menB-13m", name: "Meningococcal B booster", ageMonths: 13 },
  { key: "mmr-3y", name: "MMR #2", ageMonths: 36 },
  { key: "4in1-3y", name: "4-in-1 pre-school booster", ageMonths: 40 },
  { key: "hpv-12y", name: "HPV", ageMonths: 144 },
  { key: "tdap-14y", name: "Tdap/IPV teen booster", ageMonths: 168 },
];

const NUTRITION_TAGS = ["protein", "iron", "dairy", "veg", "fruit", "grain", "omega-3", "calcium", "fibre"];

/** Recommended growth cadence given baby age in months. */
function growthCadence(ageMonths: number): { label: string; days: number } {
  if (ageMonths < 6) return { label: "Weekly", days: 7 };
  if (ageMonths < 12) return { label: "Bi-weekly", days: 14 };
  if (ageMonths < 72) return { label: "Monthly", days: 30 };
  return { label: "Yearly", days: 365 };
}

function ageInMonths(birth: string | undefined, at: Date = new Date()): number | null {
  if (!birth) return null;
  const b = parseISO(birth);
  return (at.getFullYear() - b.getFullYear()) * 12 + (at.getMonth() - b.getMonth());
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack",
};

interface SectionDef {
  id: SectionId;
  label: string;
  icon: typeof Baby;
  hasDate?: boolean;
  hasTime?: boolean;
  growth?: boolean;
  upload?: boolean;
  list?: boolean;
  placeholder: string;
}

const SECTIONS: SectionDef[] = [
  { id: "vaccines",     label: "Vaccines",         icon: Syringe,          hasDate: true,                 placeholder: "Vaccine name (e.g. MMR)" },
  { id: "appointments", label: "Appointments",     icon: CalendarClock,    hasDate: true, hasTime: true,  placeholder: "Doctor / clinic" },
  { id: "milestones",   label: "Milestones",       icon: Star,             hasDate: true,                 placeholder: "First word, first step…" },
  { id: "health",       label: "Health Info",      icon: Heart,                                           placeholder: "Condition, allergy, blood type…" },
  { id: "growth",       label: "Size & Weight",    icon: Ruler,            hasDate: true, growth: true,   placeholder: "Measurement label (optional)" },
  { id: "play",         label: "Play Tracker",     icon: ToyBrick,         hasDate: true,                 placeholder: "Activity (e.g. tummy time)" },
  { id: "toys",         label: "Toys & Wishlist",  icon: Gift,             list: true,                    placeholder: "" },
  { id: "food",         label: "Food Schedule",    icon: UtensilsCrossed,  hasDate: true, hasTime: true,  placeholder: "Meal (e.g. Breakfast – purée)" },
  { id: "documents",    label: "Documents",        icon: FileText,         upload: true,                  placeholder: "Document name" },
  { id: "education",    label: "Education",        icon: GraduationCap,                                    placeholder: "Topic / class" },
];

// ---------------- Component ----------------

interface Props {
  projects: Project[];
  tasks: Task[];
  onSaveTasks: (t: Task[]) => void;
}

export default function BabyView({ projects, tasks, onSaveTasks }: Props) {
  const { user } = useAuth();
  const [data, setData, loaded] = useCloudState<BabyData>(CLOUD_KEYS.baby, DEFAULT_DATA);
  const [active, setActive] = useState<SectionId>("vaccines");
  const [notes, setNotes] = useState<ResearchNoteRow[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);

  // Normalise (in case of partial cloud blob)
  const safe: BabyData = useMemo(() => ({ ...DEFAULT_DATA, ...(data ?? {}) }), [data]);

  // Load research notes (for linking) + lists (for toys)
  useEffect(() => {
    let cancel = false;
    (async () => {
      const [n, l] = await Promise.all([
        supabase.from("research_notes").select("id,title,icon").order("updated_at", { ascending: false }),
        supabase.from("task_lists").select("*").order("created_at", { ascending: false }),
      ]);
      if (cancel) return;
      if (n.data) setNotes(n.data as ResearchNoteRow[]);
      if (l.data) setLists(l.data as TaskList[]);
    })();
    return () => { cancel = true; };
  }, []);

  const updateSection = <K extends keyof BabyData>(k: K, v: BabyData[K]) =>
    setData({ ...safe, [k]: v });

  const sectionDef = SECTIONS.find(s => s.id === active)!;

  // ---- Baby tasks (Family & Baby subproject) ----
  const babyProject = useMemo(
    () => projects.find(p => /baby|family.*baby|baby.*family/i.test(p.name)),
    [projects]
  );
  const babyTasks = useMemo(
    () => tasks.filter(t => t.isBabyRelated || (babyProject && t.projectId === babyProject.id)),
    [tasks, babyProject]
  );

  const toggleTask = (id: string) =>
    onSaveTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined } : t));

  const quickAddTask = (title: string) => {
    if (!title.trim()) return;
    const t: Task = {
      id: uuid(),
      title: title.trim(),
      categories: ["B2"],
      completed: false,
      createdAt: new Date().toISOString(),
      isBabyRelated: true,
      projectId: babyProject?.id,
      createdBy: user?.id,
    };
    onSaveTasks([...tasks, t]);
  };

  if (!loaded) {
    return <div className="p-8 text-sm text-muted-foreground">Loading baby tracker…</div>;
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 lg:w-64 flex-shrink-0 border-r border-border bg-card/40 flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Baby size={15} className="text-primary" /> Baby
          </h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">Linked to Family &amp; Baby tasks</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {SECTIONS.map(s => {
            const count =
              s.id === "toys" ? (safe.toys.listId ? 1 : 0)
              : (safe[s.id] as BabyEntry[]).length;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full text-left px-2 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                  active === s.id ? "bg-primary/15 text-primary" : "hover:bg-secondary"
                }`}
              >
                <s.icon size={13} />
                <span className="flex-1 truncate text-xs font-medium">{s.label}</span>
                {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Baby tasks panel */}
        <div className="border-t border-border p-2 max-h-72 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1">
            Baby tasks {babyTasks.length > 0 && `(${babyTasks.filter(t => !t.completed).length})`}
          </div>
          <QuickAdd onAdd={quickAddTask} placeholder="+ baby task" />
          <div className="space-y-0.5 mt-1">
            {babyTasks.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic px-1 py-1">
                No baby tasks yet. Mark tasks "baby-related" or add to the Family &amp; Baby project.
              </p>
            )}
            {babyTasks.slice(0, 30).map(t => (
              <button
                key={t.id}
                onClick={() => toggleTask(t.id)}
                className="w-full text-left flex items-start gap-1.5 px-1 py-1 rounded hover:bg-secondary text-xs"
              >
                {t.completed
                  ? <CheckSquare size={12} className="mt-0.5 text-emerald-500 flex-shrink-0" />
                  : <Square size={12} className="mt-0.5 text-muted-foreground flex-shrink-0" />}
                <span className={`flex-1 truncate ${t.completed ? "line-through text-muted-foreground" : ""}`}>
                  {t.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
          <BirthDateHeader
            birthDate={safe.birthDate}
            onChange={(birthDate) => setData({ ...safe, birthDate })}
          />

          <div className="flex items-center gap-2">
            <sectionDef.icon size={22} className="text-primary" />
            <h1 className="text-2xl font-bold">{sectionDef.label}</h1>
          </div>

          {active === "vaccines" && (
            <VaccinesSmart
              birthDate={safe.birthDate}
              entries={safe.vaccines}
              onChange={(next) => updateSection("vaccines", next)}
            />
          )}

          {active === "appointments" && (
            <AppointmentsSmart
              entries={safe.appointments}
              notes={notes}
              userId={user?.id ?? null}
              onChange={(next) => updateSection("appointments", next)}
            />
          )}

          {active === "milestones" && (
            <MilestonesSmart
              entries={safe.milestones}
              notes={notes}
              userId={user?.id ?? null}
              onChange={(next) => updateSection("milestones", next)}
            />
          )}

          {active === "growth" && (
            <GrowthSmart
              birthDate={safe.birthDate}
              entries={safe.growth}
              notes={notes}
              userId={user?.id ?? null}
              onChange={(next) => updateSection("growth", next)}
            />
          )}

          {active === "food" && (
            <FoodSmart
              entries={safe.food}
              onChange={(next) => updateSection("food", next)}
            />
          )}

          {active === "education" && (
            <EducationSmart
              entries={safe.education}
              onChange={(next) => updateSection("education", next)}
            />
          )}

          {active === "toys" && (
            <ToysSection
              listId={safe.toys.listId}
              lists={lists}
              onChange={(listId) => updateSection("toys", { listId })}
              onCreateList={async (name) => {
                const { data: created } = await supabase
                  .from("task_lists")
                  .insert({ name, created_by: user?.id ?? null })
                  .select()
                  .single();
                if (created) {
                  setLists(l => [created as TaskList, ...l]);
                  updateSection("toys", { listId: (created as TaskList).id });
                }
              }}
            />
          )}

          {(active === "health" || active === "documents" || active === "play") && (
            <EntryListSection
              section={sectionDef}
              entries={(safe[sectionDef.id] as BabyEntry[]) ?? []}
              notes={notes}
              userId={user?.id ?? null}
              onChange={(next) => updateSection(sectionDef.id as keyof BabyData, next as any)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Birth-date header ----------------
function BirthDateHeader({ birthDate, onChange }: { birthDate?: string; onChange: (v: string) => void }) {
  const months = ageInMonths(birthDate);
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/60">
      <Cake size={16} className="text-primary" />
      <label className="text-xs font-medium text-muted-foreground">Birth date</label>
      <input
        type="date"
        value={birthDate ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-secondary/40 rounded px-2 py-1 outline-none focus:bg-secondary/70"
      />
      {months !== null && (
        <span className="text-xs text-muted-foreground">
          Age: <span className="font-medium text-foreground">
            {months < 24 ? `${months} months` : `${Math.floor(months / 12)}y ${months % 12}m`}
          </span>
        </span>
      )}
    </div>
  );
}


// ---------------- Quick add ----------------
function QuickAdd({ onAdd, placeholder }: { onAdd: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState("");
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim()) {
          onAdd(v);
          setV("");
        }
      }}
      placeholder={placeholder}
      className="w-full text-xs bg-secondary/40 rounded px-2 py-1 outline-none focus:bg-secondary/70"
    />
  );
}

// ---------------- Entry list section ----------------
function EntryListSection({
  section, entries, notes, userId, onChange,
}: {
  section: SectionDef;
  entries: BabyEntry[];
  notes: ResearchNoteRow[];
  userId: string | null;
  onChange: (next: BabyEntry[]) => void;
}) {
  const [openAdd, setOpenAdd] = useState(false);

  const addEntry = (e: BabyEntry) => onChange([e, ...entries]);
  const patch = (id: string, p: Partial<BabyEntry>) =>
    onChange(entries.map(e => e.id === id ? { ...e, ...p } : e));
  const remove = (id: string) => onChange(entries.filter(e => e.id !== id));

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [entries]
  );

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpenAdd(v => !v)}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
      >
        <Plus size={14} /> Add {section.label.toLowerCase()}
      </button>

      {openAdd && (
        <EntryForm
          section={section}
          userId={userId}
          onAdd={(e) => { addEntry(e); setOpenAdd(false); }}
          onCancel={() => setOpenAdd(false)}
        />
      )}

      <div className="space-y-2">
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No entries yet.</p>
        )}
        {sorted.map(e => (
          <EntryCard
            key={e.id}
            section={section}
            entry={e}
            notes={notes}
            onPatch={(p) => patch(e.id, p)}
            onDelete={() => remove(e.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------- Entry form ----------------
function EntryForm({
  section, userId, onAdd, onCancel,
}: {
  section: SectionDef;
  userId: string | null;
  onAdd: (e: BabyEntry) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [headCm, setHeadCm] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    if (!userId) return;
    setUploading(true);
    try {
      const path = `baby/${userId}/${uuid()}-${file.name}`;
      const up = await supabase.storage.from("research-files").upload(path, file);
      if (up.error) throw up.error;
      const signed = await supabase.storage.from("research-files").createSignedUrl(path, 60 * 60 * 24 * 365);
      setFilePath(path);
      setFileName(file.name);
      setFileType(file.type);
      setFileUrl(signed.data?.signedUrl ?? null);
      if (!title) setTitle(file.name);
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const t = title.trim();
    if (!t && !filePath) return;
    onAdd({
      id: uuid(),
      title: t || fileName || "Untitled",
      date: date || undefined,
      time: time || undefined,
      notes: notes || undefined,
      linkedNoteIds: [],
      heightCm: heightCm ? Number(heightCm) : undefined,
      weightKg: weightKg ? Number(weightKg) : undefined,
      headCm: headCm ? Number(headCm) : undefined,
      filePath: filePath ?? undefined,
      fileName: fileName ?? undefined,
      fileType: fileType ?? undefined,
      fileUrl: fileUrl ?? undefined,
    });
  };

  return (
    <div className="p-3 rounded-lg border border-border bg-card space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={section.placeholder}
        className="w-full text-sm bg-secondary/30 rounded px-2 py-1.5 outline-none focus:bg-secondary/50"
      />

      {(section.hasDate || section.hasTime) && (
        <div className="flex gap-2">
          {section.hasDate && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm bg-secondary/30 rounded px-2 py-1.5 outline-none focus:bg-secondary/50"
            />
          )}
          {section.hasTime && (
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="text-sm bg-secondary/30 rounded px-2 py-1.5 outline-none focus:bg-secondary/50"
            />
          )}
        </div>
      )}

      {section.growth && (
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Height (cm)" value={heightCm} onChange={setHeightCm} />
          <NumField label="Weight (kg)" value={weightKg} onChange={setWeightKg} />
          <NumField label="Head (cm)" value={headCm} onChange={setHeadCm} />
        </div>
      )}

      {section.upload && (
        <div>
          <label className="flex items-center gap-2 text-xs text-primary cursor-pointer hover:opacity-80">
            <Upload size={12} />
            {uploading ? "Uploading…" : filePath ? `✓ ${fileName}` : "Attach file (PDF, image…)"}
            <input
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
            />
          </label>
        </div>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes…"
        rows={2}
        className="w-full text-sm bg-secondary/30 rounded px-2 py-1.5 outline-none focus:bg-secondary/50"
      />

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded hover:bg-secondary">Cancel</button>
        <button onClick={submit} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90">Add</button>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm bg-secondary/30 rounded px-2 py-1 outline-none focus:bg-secondary/50 mt-0.5"
      />
    </label>
  );
}

// ---------------- Entry card ----------------
function EntryCard({
  section, entry, notes, onPatch, onDelete,
}: {
  section: SectionDef;
  entry: BabyEntry;
  notes: ResearchNoteRow[];
  onPatch: (p: Partial<BabyEntry>) => void;
  onDelete: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const linked = (entry.linkedNoteIds ?? []).map(id => notes.find(n => n.id === id)).filter(Boolean) as ResearchNoteRow[];

  const openFile = async () => {
    if (!entry.filePath) return;
    const signed = await supabase.storage.from("research-files").createSignedUrl(entry.filePath, 60 * 10);
    if (signed.data?.signedUrl) window.open(signed.data.signedUrl, "_blank");
  };

  return (
    <div className="p-3 rounded-lg border border-border bg-card">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{entry.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
            {entry.date && <span>{format(parseISO(entry.date), "PPP")}</span>}
            {entry.time && <span>{entry.time}</span>}
            {section.growth && (
              <>
                {entry.heightCm !== undefined && <span>{entry.heightCm} cm</span>}
                {entry.weightKg !== undefined && <span>{entry.weightKg} kg</span>}
                {entry.headCm !== undefined && <span>head {entry.headCm} cm</span>}
              </>
            )}
            {entry.fileName && (
              <button onClick={openFile} className="text-primary hover:underline flex items-center gap-1">
                <FileText size={10} /> {entry.fileName}
              </button>
            )}
          </div>
          {entry.notes && <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{entry.notes}</div>}

          {/* Linked notes */}
          {linked.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {linked.map(n => (
                <span key={n.id} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
                  <Link2 size={9} /> {n.icon ?? "📄"} {n.title}
                  <button
                    onClick={() => onPatch({ linkedNoteIds: (entry.linkedNoteIds ?? []).filter(id => id !== n.id) })}
                    className="hover:opacity-70"
                  ><X size={9} /></button>
                </span>
              ))}
            </div>
          )}

          <button
            onClick={() => setPicking(v => !v)}
            className="mt-2 text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <Link2 size={10} /> Link a note
          </button>

          {picking && (
            <div className="mt-1 max-h-48 overflow-y-auto border border-border rounded p-1 bg-background space-y-0.5">
              {notes.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic p-1">No notes yet — create one in the Notes tab.</p>
              )}
              {notes
                .filter(n => !(entry.linkedNoteIds ?? []).includes(n.id))
                .map(n => (
                  <button
                    key={n.id}
                    onClick={() => {
                      onPatch({ linkedNoteIds: [...(entry.linkedNoteIds ?? []), n.id] });
                      setPicking(false);
                    }}
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-secondary"
                  >
                    {n.icon ?? "📄"} {n.title}
                  </button>
                ))}
            </div>
          )}
        </div>

        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ---------------- Toys section ----------------
function ToysSection({
  listId, lists, onChange, onCreateList,
}: {
  listId?: string | null;
  lists: TaskList[];
  onChange: (listId: string | null) => void;
  onCreateList: (name: string) => Promise<void>;
}) {
  const linked = lists.find(l => l.id === listId);
  const [items, setItems] = useState<{ id: string; content: string; checked: boolean }[]>([]);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    if (!listId) { setItems([]); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("list_items")
        .select("id,content,checked,position")
        .eq("list_id", listId)
        .order("position");
      if (!cancel && data) setItems(data as any);
    })();
    const ch = supabase
      .channel(`baby-list-${listId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "list_items", filter: `list_id=eq.${listId}` }, async () => {
        const { data } = await supabase.from("list_items").select("id,content,checked,position").eq("list_id", listId).order("position");
        if (data) setItems(data as any);
      })
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, [listId]);

  const addItem = async () => {
    if (!newItem.trim() || !listId) return;
    await supabase.from("list_items").insert({ list_id: listId, content: newItem.trim(), position: items.length });
    setNewItem("");
  };
  const toggleItem = async (id: string, checked: boolean) =>
    void supabase.from("list_items").update({ checked: !checked }).eq("id", id);
  const removeItem = async (id: string) => void supabase.from("list_items").delete().eq("id", id);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={listId ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="text-sm bg-secondary/40 rounded px-2 py-1.5 outline-none"
        >
          <option value="">— Link an existing list —</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button
          onClick={async () => {
            const name = prompt("New wishlist name", "Toys to buy");
            if (name) await onCreateList(name);
          }}
          className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90 flex items-center gap-1"
        >
          <Plus size={11} /> New list
        </button>
      </div>

      {!linked && (
        <p className="text-sm text-muted-foreground italic">Pick or create a wishlist to manage toys here. Items sync with the Lists view.</p>
      )}

      {linked && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addItem(); }}
              placeholder="Add toy / item…"
              className="flex-1 text-sm bg-secondary/40 rounded px-2 py-1.5 outline-none focus:bg-secondary/70"
            />
            <button onClick={addItem} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90">Add</button>
          </div>
          <div className="space-y-1">
            {items.length === 0 && <p className="text-xs text-muted-foreground italic">No items yet.</p>}
            {items.map(it => (
              <div key={it.id} className="flex items-center gap-2 p-2 rounded border border-border bg-card group">
                <button onClick={() => toggleItem(it.id, it.checked)}>
                  {it.checked ? <CheckSquare size={14} className="text-emerald-500" /> : <Square size={14} className="text-muted-foreground" />}
                </button>
                <span className={`flex-1 text-sm ${it.checked ? "line-through text-muted-foreground" : ""}`}>{it.content}</span>
                <button onClick={() => removeItem(it.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <ExternalLink size={10} /> Edit fully in the Lists view.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SMART SECTIONS
// ============================================================

// ---------------- Vaccines ----------------
function VaccinesSmart({
  birthDate, entries, onChange,
}: {
  birthDate?: string;
  entries: BabyEntry[];
  onChange: (next: BabyEntry[]) => void;
}) {
  const byKey = useMemo(() => {
    const m: Record<string, BabyEntry> = {};
    entries.forEach(e => { if (e.vaccineKey) m[e.vaccineKey] = e; });
    return m;
  }, [entries]);

  const today = new Date();
  const babyMonths = ageInMonths(birthDate, today) ?? -1;

  const dueDateFor = (months: number) => birthDate
    ? format(addDays(parseISO(birthDate), Math.round(months * 30.44)), "PPP")
    : `~${months}m`;

  const toggle = (key: string, name: string, months: number) => {
    const existing = byKey[key];
    if (existing) {
      onChange(entries.map(e => e.id === existing.id
        ? { ...e, administered: !e.administered, date: !e.administered ? format(today, "yyyy-MM-dd") : e.date }
        : e));
    } else {
      onChange([{
        id: uuid(),
        title: name,
        vaccineKey: key,
        administered: true,
        date: format(today, "yyyy-MM-dd"),
        notes: `Scheduled for ~${months} months`,
      }, ...entries]);
    }
  };

  const updateDate = (key: string, date: string, name: string, months: number) => {
    const existing = byKey[key];
    if (existing) {
      onChange(entries.map(e => e.id === existing.id ? { ...e, date } : e));
    } else {
      onChange([{ id: uuid(), title: name, vaccineKey: key, administered: false, date, notes: `Scheduled for ~${months} months` }, ...entries]);
    }
  };

  const done = VACCINE_SCHEDULE.filter(v => byKey[v.key]?.administered).length;
  const upcoming = VACCINE_SCHEDULE.filter(v => !byKey[v.key]?.administered && v.ageMonths <= babyMonths + 2);
  const overdue = VACCINE_SCHEDULE.filter(v => !byKey[v.key]?.administered && v.ageMonths < babyMonths);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Administered" value={`${done}/${VACCINE_SCHEDULE.length}`} />
        <Stat label="Upcoming (≤2mo)" value={String(upcoming.length)} />
        <Stat label="Overdue" value={String(overdue.length)} accent={overdue.length > 0 ? "destructive" : undefined} />
      </div>

      {!birthDate && (
        <p className="text-xs text-muted-foreground italic flex items-center gap-1">
          <AlertCircle size={11} /> Set the birth date above to see when each vaccine is due.
        </p>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <span className="col-span-1">✓</span>
          <span className="col-span-5">Vaccine</span>
          <span className="col-span-2">Recommended</span>
          <span className="col-span-2">Due</span>
          <span className="col-span-2">Given</span>
        </div>
        {VACCINE_SCHEDULE.map(v => {
          const e = byKey[v.key];
          const isOverdue = !e?.administered && babyMonths > v.ageMonths;
          return (
            <div key={v.key} className={`grid grid-cols-12 gap-2 px-3 py-2 border-t border-border items-center text-xs ${isOverdue ? "bg-destructive/5" : ""}`}>
              <button className="col-span-1" onClick={() => toggle(v.key, v.name, v.ageMonths)}>
                {e?.administered
                  ? <CheckSquare size={15} className="text-emerald-500" />
                  : <Square size={15} className={isOverdue ? "text-destructive" : "text-muted-foreground"} />}
              </button>
              <span className={`col-span-5 ${e?.administered ? "line-through text-muted-foreground" : "font-medium"}`}>{v.name}</span>
              <span className="col-span-2 text-muted-foreground">{v.ageMonths === 0 ? "Birth" : v.ageMonths < 24 ? `${v.ageMonths}m` : `${Math.floor(v.ageMonths/12)}y`}</span>
              <span className="col-span-2 text-muted-foreground text-[10px]">{dueDateFor(v.ageMonths)}</span>
              <input
                type="date"
                value={e?.date ?? ""}
                onChange={(ev) => updateDate(v.key, ev.target.value, v.name, v.ageMonths)}
                className="col-span-2 text-[11px] bg-secondary/40 rounded px-1.5 py-1 outline-none focus:bg-secondary/70"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "destructive" | "primary" }) {
  const color = accent === "destructive" ? "text-destructive" : accent === "primary" ? "text-primary" : "";
  return (
    <div className="p-3 rounded-lg border border-border bg-card">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

// ---------------- Appointments ----------------
function AppointmentsSmart({
  entries, notes, userId, onChange,
}: {
  entries: BabyEntry[];
  notes: ResearchNoteRow[];
  userId: string | null;
  onChange: (next: BabyEntry[]) => void;
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const now = new Date();

  const { upcoming, past } = useMemo(() => {
    const u: BabyEntry[] = [], p: BabyEntry[] = [];
    entries.forEach(e => {
      const d = e.date ? parseISO(e.date) : null;
      if (d && d >= new Date(now.toDateString())) u.push(e); else p.push(e);
    });
    u.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    p.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { upcoming: u, past: p };
  }, [entries]);

  const list = tab === "upcoming" ? upcoming : past;
  const sectionDef = SECTIONS.find(s => s.id === "appointments")!;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border">
        <TabBtn active={tab === "upcoming"} onClick={() => setTab("upcoming")}>Upcoming ({upcoming.length})</TabBtn>
        <TabBtn active={tab === "past"} onClick={() => setTab("past")}>History ({past.length})</TabBtn>
      </div>
      <EntryListSection
        section={sectionDef}
        entries={list}
        notes={notes}
        userId={userId}
        onChange={(next) => {
          // merge next back into full entries (replace this tab's slice)
          const ids = new Set(list.map(e => e.id));
          const others = entries.filter(e => !ids.has(e.id));
          onChange([...next, ...others]);
        }}
      />
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs border-b-2 -mb-px ${active ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >{children}</button>
  );
}

// ---------------- Milestones ----------------
function MilestonesSmart({
  entries, notes, userId, onChange,
}: {
  entries: BabyEntry[];
  notes: ResearchNoteRow[];
  userId: string | null;
  onChange: (next: BabyEntry[]) => void;
}) {
  const [filter, setFilter] = useState<"all" | Sentiment>("all");
  const counts = useMemo(() => ({
    positive: entries.filter(e => e.sentiment === "positive").length,
    negative: entries.filter(e => e.sentiment === "negative").length,
    neutral: entries.filter(e => !e.sentiment || e.sentiment === "neutral").length,
  }), [entries]);

  const filtered = filter === "all"
    ? entries
    : entries.filter(e => (e.sentiment ?? "neutral") === filter);

  const sorted = [...filtered].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const addMilestone = (title: string, sentiment: Sentiment) => {
    onChange([{ id: uuid(), title, sentiment, date: format(new Date(), "yyyy-MM-dd") }, ...entries]);
  };
  const setSent = (id: string, sentiment: Sentiment) =>
    onChange(entries.map(e => e.id === id ? { ...e, sentiment } : e));
  const remove = (id: string) => onChange(entries.filter(e => e.id !== id));
  const patch = (id: string, p: Partial<BabyEntry>) =>
    onChange(entries.map(e => e.id === id ? { ...e, ...p } : e));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <FilterStat icon={Smile} color="text-emerald-500" label="Positive" value={counts.positive} active={filter === "positive"} onClick={() => setFilter(filter === "positive" ? "all" : "positive")} />
        <FilterStat icon={Meh} color="text-muted-foreground" label="Neutral / Log" value={counts.neutral} active={filter === "neutral"} onClick={() => setFilter(filter === "neutral" ? "all" : "neutral")} />
        <FilterStat icon={Frown} color="text-destructive" label="Concern" value={counts.negative} active={filter === "negative"} onClick={() => setFilter(filter === "negative" ? "all" : "negative")} />
      </div>

      <MilestoneAdd onAdd={addMilestone} />

      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-sm text-muted-foreground italic">No milestones recorded.</p>}
        {sorted.map(e => (
          <div key={e.id} className="p-3 rounded-lg border border-border bg-card">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm flex items-center gap-2">
                  {e.sentiment === "positive" && <Smile size={14} className="text-emerald-500" />}
                  {e.sentiment === "negative" && <Frown size={14} className="text-destructive" />}
                  {(!e.sentiment || e.sentiment === "neutral") && <Meh size={14} className="text-muted-foreground" />}
                  {e.title}
                </div>
                {e.date && <div className="text-xs text-muted-foreground mt-0.5">{format(parseISO(e.date), "PPP")}</div>}
                {e.notes && <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{e.notes}</div>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setSent(e.id, "positive")} className="p-1 hover:bg-secondary rounded" title="Positive"><Smile size={13} className="text-emerald-500" /></button>
                <button onClick={() => setSent(e.id, "neutral")} className="p-1 hover:bg-secondary rounded" title="Log"><Meh size={13} /></button>
                <button onClick={() => setSent(e.id, "negative")} className="p-1 hover:bg-secondary rounded" title="Concern"><Frown size={13} className="text-destructive" /></button>
                <button onClick={() => remove(e.id)} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterStat({ icon: Icon, color, label, value, active, onClick }: { icon: typeof Smile; color: string; label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary/40"}`}
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className={color} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </button>
  );
}

function MilestoneAdd({ onAdd }: { onAdd: (title: string, s: Sentiment) => void }) {
  const [title, setTitle] = useState("");
  const [sent, setSent] = useState<Sentiment>("positive");
  return (
    <div className="flex gap-2 items-center p-3 rounded-lg border border-border bg-card">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="First word, first step, slept through night…"
        className="flex-1 text-sm bg-secondary/30 rounded px-2 py-1.5 outline-none focus:bg-secondary/50"
      />
      <select value={sent} onChange={(e) => setSent(e.target.value as Sentiment)} className="text-xs bg-secondary/40 rounded px-2 py-1.5 outline-none">
        <option value="positive">Positive</option>
        <option value="neutral">Log</option>
        <option value="negative">Concern</option>
      </select>
      <button
        onClick={() => { if (title.trim()) { onAdd(title.trim(), sent); setTitle(""); } }}
        className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90"
      >Add</button>
    </div>
  );
}

// ---------------- Growth ----------------
function GrowthSmart({
  birthDate, entries, notes, userId, onChange,
}: {
  birthDate?: string;
  entries: BabyEntry[];
  notes: ResearchNoteRow[];
  userId: string | null;
  onChange: (next: BabyEntry[]) => void;
}) {
  const months = ageInMonths(birthDate);
  const cadence = months !== null ? growthCadence(months) : null;
  const sorted = [...entries].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const last = sorted.find(e => e.date);
  const daysSince = last?.date ? differenceInDays(new Date(), parseISO(last.date)) : null;
  const overdue = cadence && daysSince !== null && daysSince > cadence.days;
  const sectionDef = SECTIONS.find(s => s.id === "growth")!;

  const latest = sorted[0];
  const prev = sorted[1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Cadence" value={cadence?.label ?? "Set birthday"} accent="primary" />
        <Stat label="Last entry" value={last?.date ? `${daysSince}d ago` : "—"} accent={overdue ? "destructive" : undefined} />
        <Stat label="Height" value={latest?.heightCm ? `${latest.heightCm} cm` : "—"} />
        <Stat label="Weight" value={latest?.weightKg ? `${latest.weightKg} kg` : "—"} />
      </div>

      {prev && latest && (
        <div className="p-3 rounded-lg border border-border bg-card text-xs flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-muted-foreground">Change since {format(parseISO(prev.date!), "PP")}:</span>
          {latest.heightCm && prev.heightCm && <span>Height <span className="font-medium">{(latest.heightCm - prev.heightCm).toFixed(1)} cm</span></span>}
          {latest.weightKg && prev.weightKg && <span>Weight <span className="font-medium">{(latest.weightKg - prev.weightKg).toFixed(2)} kg</span></span>}
          {latest.headCm && prev.headCm && <span>Head <span className="font-medium">{(latest.headCm - prev.headCm).toFixed(1)} cm</span></span>}
        </div>
      )}

      {overdue && (
        <div className="p-2 rounded border border-destructive/30 bg-destructive/5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle size={12} /> A new measurement is due — current cadence is {cadence!.label.toLowerCase()}.
        </div>
      )}

      <EntryListSection
        section={sectionDef}
        entries={entries}
        notes={notes}
        userId={userId}
        onChange={onChange}
      />
    </div>
  );
}

// ---------------- Food ----------------
function FoodSmart({
  entries, onChange,
}: {
  entries: BabyEntry[];
  onChange: (next: BabyEntry[]) => void;
}) {
  const [view, setView] = useState<"week" | "log">("week");

  // Weekly plan = entries with dayOfWeek set
  const plan = useMemo(() => {
    const m: Record<string, BabyEntry[]> = {};
    entries.forEach(e => {
      if (e.dayOfWeek === undefined || !e.mealType) return;
      const k = `${e.dayOfWeek}|${e.mealType}`;
      (m[k] ||= []).push(e);
    });
    return m;
  }, [entries]);

  const addPlan = (dayOfWeek: number, mealType: MealType, title: string) => {
    if (!title.trim()) return;
    onChange([{ id: uuid(), title: title.trim(), dayOfWeek, mealType }, ...entries]);
  };
  const removeEntry = (id: string) => onChange(entries.filter(e => e.id !== id));
  const toggleTag = (id: string, tag: string) => {
    onChange(entries.map(e => {
      if (e.id !== id) return e;
      const set = new Set(e.nutrition ?? []);
      set.has(tag) ? set.delete(tag) : set.add(tag);
      return { ...e, nutrition: Array.from(set) };
    }));
  };

  // Nutrition rollup for the week
  const tagCounts = useMemo(() => {
    const c: Record<string, number> = {};
    entries.forEach(e => (e.nutrition ?? []).forEach(t => { c[t] = (c[t] ?? 0) + 1; }));
    return c;
  }, [entries]);

  const logEntries = entries.filter(e => e.date && !e.dayOfWeek === false || (e.dayOfWeek === undefined && e.date));
  const addLog = (title: string, mealType: MealType) => {
    onChange([{ id: uuid(), title, mealType, date: format(new Date(), "yyyy-MM-dd"), time: format(new Date(), "HH:mm") }, ...entries]);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        <TabBtn active={view === "week"} onClick={() => setView("week")}>Weekly plan</TabBtn>
        <TabBtn active={view === "log"} onClick={() => setView("log")}>Feed log</TabBtn>
      </div>

      {view === "week" && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40">
                <tr>
                  <th className="text-left px-2 py-2 font-semibold text-[10px] uppercase text-muted-foreground">Meal</th>
                  {DAY_NAMES.map(d => <th key={d} className="text-left px-2 py-2 font-semibold text-[10px] uppercase text-muted-foreground">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {(["breakfast","lunch","dinner","snack"] as MealType[]).map(meal => (
                  <tr key={meal} className="border-t border-border align-top">
                    <td className="px-2 py-2 font-medium">{MEAL_LABELS[meal]}</td>
                    {DAY_NAMES.map((_, day) => {
                      const items = plan[`${day}|${meal}`] ?? [];
                      return (
                        <td key={day} className="px-1.5 py-1.5 min-w-[110px]">
                          <div className="space-y-1">
                            {items.map(e => (
                              <div key={e.id} className="group p-1.5 rounded bg-secondary/40 hover:bg-secondary/70">
                                <div className="flex items-center gap-1">
                                  <span className="flex-1 truncate text-[11px]">{e.title}</span>
                                  <button onClick={() => removeEntry(e.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                                    <X size={10} />
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-0.5 mt-0.5">
                                  {NUTRITION_TAGS.slice(0, 6).map(t => (
                                    <button
                                      key={t}
                                      onClick={() => toggleTag(e.id, t)}
                                      className={`text-[8px] px-1 rounded ${e.nutrition?.includes(t) ? "bg-primary/30 text-primary" : "text-muted-foreground hover:bg-secondary"}`}
                                    >{t}</button>
                                  ))}
                                </div>
                              </div>
                            ))}
                            <CellAdd onAdd={(t) => addPlan(day, meal, t)} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-lg border border-border bg-card">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Nutrition coverage</div>
            <div className="flex flex-wrap gap-2">
              {NUTRITION_TAGS.map(t => (
                <span key={t} className={`text-xs px-2 py-1 rounded ${tagCounts[t] ? "bg-primary/15 text-primary" : "bg-secondary/40 text-muted-foreground"}`}>
                  {t} <span className="font-bold ml-1">{tagCounts[t] ?? 0}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {view === "log" && (
        <>
          <LogAdd onAdd={addLog} />
          <div className="space-y-2">
            {logEntries.length === 0 && <p className="text-sm text-muted-foreground italic">No feed log entries yet.</p>}
            {logEntries.map(e => (
              <div key={e.id} className="p-2 rounded-lg border border-border bg-card flex items-center gap-3 text-sm">
                <Clock size={12} className="text-muted-foreground" />
                <span className="font-medium">{e.title}</span>
                {e.mealType && <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/60">{MEAL_LABELS[e.mealType]}</span>}
                <span className="text-xs text-muted-foreground ml-auto">{e.date && format(parseISO(e.date), "PP")} {e.time}</span>
                <button onClick={() => removeEntry(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CellAdd({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
      <Plus size={9} /> add
    </button>
  );
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v.trim()) onAdd(v); setV(""); setOpen(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim()) { onAdd(v); setV(""); setOpen(false); }
        if (e.key === "Escape") { setV(""); setOpen(false); }
      }}
      placeholder="meal…"
      className="w-full text-[11px] bg-background border border-border rounded px-1.5 py-1 outline-none focus:border-primary"
    />
  );
}

function LogAdd({ onAdd }: { onAdd: (title: string, meal: MealType) => void }) {
  const [title, setTitle] = useState("");
  const [meal, setMeal] = useState<MealType>("breakfast");
  return (
    <div className="flex gap-2 items-center p-3 rounded-lg border border-border bg-card">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What did baby eat?" className="flex-1 text-sm bg-secondary/30 rounded px-2 py-1.5 outline-none focus:bg-secondary/50" />
      <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)} className="text-xs bg-secondary/40 rounded px-2 py-1.5 outline-none">
        {(["breakfast","lunch","dinner","snack"] as MealType[]).map(m => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
      </select>
      <button onClick={() => { if (title.trim()) { onAdd(title.trim(), meal); setTitle(""); } }} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90">Log</button>
    </div>
  );
}

// ---------------- Education ----------------
function EducationSmart({
  entries, onChange,
}: {
  entries: BabyEntry[];
  onChange: (next: BabyEntry[]) => void;
}) {
  const [view, setView] = useState<"week" | "languages">("week");

  const plan = useMemo(() => {
    const m: Record<number, BabyEntry[]> = {};
    entries.forEach(e => { if (e.dayOfWeek !== undefined) (m[e.dayOfWeek] ||= []).push(e); });
    return m;
  }, [entries]);

  const langTotals = useMemo(() => {
    const t: Record<Language, number> = { german: 0, english: 0, spanish: 0 };
    entries.forEach(e => { if (e.language) t[e.language] += e.durationMin ?? 0; });
    return t;
  }, [entries]);

  const total = langTotals.german + langTotals.english + langTotals.spanish;
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  const addPlan = (day: number, payload: { title: string; kind: ActivityKind; language?: Language; durationMin?: number }) => {
    if (!payload.title.trim()) return;
    onChange([{
      id: uuid(),
      title: payload.title.trim(),
      dayOfWeek: day,
      activityKind: payload.kind,
      language: payload.language,
      durationMin: payload.durationMin,
    }, ...entries]);
  };
  const remove = (id: string) => onChange(entries.filter(e => e.id !== id));

  const logSession = (language: Language, durationMin: number, title: string) => {
    onChange([{ id: uuid(), title: title || `${language} session`, language, durationMin, activityKind: "language", date: format(new Date(), "yyyy-MM-dd") }, ...entries]);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        <TabBtn active={view === "week"} onClick={() => setView("week")}>Weekly schedule</TabBtn>
        <TabBtn active={view === "languages"} onClick={() => setView("languages")}>Languages</TabBtn>
      </div>

      {view === "week" && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {DAY_NAMES.map((d, day) => (
            <div key={d} className="rounded-lg border border-border bg-card p-2 space-y-1.5 min-h-[140px]">
              <div className="text-xs font-semibold text-center">{d}</div>
              {(plan[day] ?? []).map(e => (
                <div key={e.id} className="group p-1.5 rounded bg-secondary/40 hover:bg-secondary/70 text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="flex-1 truncate font-medium">{e.title}</span>
                    <button onClick={() => remove(e.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X size={9} /></button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5 text-[9px]">
                    {e.activityKind && <span className="px-1 rounded bg-primary/20 text-primary">{e.activityKind}</span>}
                    {e.language && <span className="px-1 rounded bg-amber-500/20 text-amber-500">{e.language}</span>}
                    {e.durationMin && <span className="text-muted-foreground">{e.durationMin}m</span>}
                  </div>
                </div>
              ))}
              <EduCellAdd onAdd={(p) => addPlan(day, p)} />
            </div>
          ))}
        </div>
      )}

      {view === "languages" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {(["german","english","spanish"] as Language[]).map(l => (
              <div key={l} className="p-3 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2">
                  <Languages size={14} className="text-primary" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold capitalize">{l}</span>
                </div>
                <div className="text-xl font-bold mt-1">{langTotals[l]}<span className="text-xs font-normal text-muted-foreground ml-1">min</span></div>
                <div className="mt-2 h-1.5 rounded bg-secondary/40 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct(langTotals[l])}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{pct(langTotals[l])}% of total</div>
              </div>
            ))}
          </div>
          <LanguageLog onLog={logSession} />
          <div className="space-y-1">
            {entries.filter(e => e.language && e.date).slice(0, 30).map(e => (
              <div key={e.id} className="flex items-center gap-2 text-xs p-2 rounded border border-border bg-card">
                <Activity size={11} className="text-primary" />
                <span className="font-medium">{e.title}</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[10px] capitalize">{e.language}</span>
                {e.durationMin && <span className="text-muted-foreground">{e.durationMin}m</span>}
                <span className="ml-auto text-muted-foreground">{e.date && format(parseISO(e.date), "PP")}</span>
                <button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EduCellAdd({ onAdd }: { onAdd: (p: { title: string; kind: ActivityKind; language?: Language; durationMin?: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ActivityKind>("play");
  const [lang, setLang] = useState<Language | "">("");
  const [dur, setDur] = useState("");
  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
      <Plus size={9} /> add
    </button>
  );
  return (
    <div className="space-y-1">
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Activity" className="w-full text-[11px] bg-background border border-border rounded px-1.5 py-1 outline-none focus:border-primary" />
      <select value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)} className="w-full text-[10px] bg-secondary/40 rounded px-1.5 py-1 outline-none">
        {(["play","language","music","motor","cognitive","social","creative"] as ActivityKind[]).map(k => <option key={k} value={k}>{k}</option>)}
      </select>
      <select value={lang} onChange={(e) => setLang(e.target.value as Language | "")} className="w-full text-[10px] bg-secondary/40 rounded px-1.5 py-1 outline-none">
        <option value="">no language</option>
        <option value="german">German</option>
        <option value="english">English</option>
        <option value="spanish">Spanish</option>
      </select>
      <input type="number" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="min" className="w-full text-[10px] bg-secondary/40 rounded px-1.5 py-1 outline-none" />
      <div className="flex gap-1">
        <button
          onClick={() => {
            onAdd({ title, kind, language: lang || undefined, durationMin: dur ? Number(dur) : undefined });
            setTitle(""); setLang(""); setDur(""); setOpen(false);
          }}
          className="flex-1 text-[10px] bg-primary text-primary-foreground rounded px-1.5 py-1"
        >Save</button>
        <button onClick={() => setOpen(false)} className="text-[10px] px-1.5 py-1 hover:bg-secondary rounded">×</button>
      </div>
    </div>
  );
}

function LanguageLog({ onLog }: { onLog: (l: Language, dur: number, title: string) => void }) {
  const [lang, setLang] = useState<Language>("german");
  const [dur, setDur] = useState("15");
  const [title, setTitle] = useState("");
  return (
    <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg border border-border bg-card">
      <Languages size={14} className="text-primary" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session (book, song…)" className="flex-1 min-w-[140px] text-sm bg-secondary/30 rounded px-2 py-1.5 outline-none focus:bg-secondary/50" />
      <select value={lang} onChange={(e) => setLang(e.target.value as Language)} className="text-xs bg-secondary/40 rounded px-2 py-1.5 outline-none">
        <option value="german">German</option>
        <option value="english">English</option>
        <option value="spanish">Spanish</option>
      </select>
      <input type="number" value={dur} onChange={(e) => setDur(e.target.value)} className="w-20 text-xs bg-secondary/40 rounded px-2 py-1.5 outline-none" />
      <span className="text-xs text-muted-foreground">min</span>
      <button onClick={() => { onLog(lang, Number(dur) || 0, title.trim()); setTitle(""); }} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90">Log</button>
    </div>
  );
}
