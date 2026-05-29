import { useEffect, useMemo, useState } from "react";
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
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
          <div className="flex items-center gap-2">
            <sectionDef.icon size={22} className="text-primary" />
            <h1 className="text-2xl font-bold">{sectionDef.label}</h1>
          </div>

          {sectionDef.list ? (
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
          ) : (
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
