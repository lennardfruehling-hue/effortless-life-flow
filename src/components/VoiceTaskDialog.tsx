import { useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { Mic, MicOff, X, Volume2, ChevronRight } from "lucide-react";
import { Task, Category, ALL_CATEGORIES, CATEGORY_META } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onClose: () => void;
  onSave: (task: Task) => void;
}

type FieldKey =
  | "title"
  | "description"
  | "categories"
  | "duration"
  | "dueDate"
  | "dueTime"
  | "location"
  | "recurrence";

interface Step {
  key: FieldKey;
  prompt: string;
  required?: boolean;
  parse: (raw: string) => { ok: boolean; value?: any; error?: string };
}

// ---------- Parsers ----------
const SKIP_RE = /^(skip|none|nothing|no|pass|next)\.?$/i;

function parseTitle(raw: string) {
  const t = raw.trim().replace(/[.!?]+$/, "");
  if (!t) return { ok: false, error: "I didn't catch a title. Please say the task title." };
  return { ok: true, value: t };
}

function parseDescription(raw: string) {
  const t = raw.trim();
  if (!t || SKIP_RE.test(t)) return { ok: true, value: undefined };
  return { ok: true, value: t.replace(/[.!?]+$/, "") };
}

function parseCategories(raw: string): { ok: boolean; value?: Category[]; error?: string } {
  const text = " " + raw.toLowerCase().replace(/[.,;]/g, " ") + " ";
  const found = new Set<Category>();
  for (const cat of ALL_CATEGORIES) {
    const re = new RegExp(`\\b${cat.toLowerCase()}\\b`, "i");
    if (re.test(text)) found.add(cat);
  }
  // semantic hints
  if (/\btoday\b/.test(text)) found.add("A1");
  if (/\bthis week\b/.test(text)) found.add("A2");
  if (/\bquick\b|\beasy\b/.test(text)) found.add("C");
  if (/\bproud\b/.test(text)) found.add("H");
  if (/\bcritical\b/.test(text)) found.add("B1");
  if (/\bimportant\b/.test(text)) found.add("B2");
  if (/\bhate\b|\bdespise\b/.test(text)) found.add("F");
  if (/\benjoy\b|\blike\b/.test(text)) found.add("G");
  if (/\bavoid\b/.test(text)) found.add("I");
  if (/\blong[- ]?term\b/.test(text)) found.add("J");
  if (found.size === 0)
    return {
      ok: false,
      error:
        "I need at least one category. Say things like A1, B2, C, or words like 'today', 'critical', 'quick'.",
    };
  return { ok: true, value: Array.from(found) };
}

function parseDuration(raw: string) {
  const t = raw.toLowerCase().trim();
  if (!t || SKIP_RE.test(t)) return { ok: true, value: undefined };
  let mins = 0;
  const h = t.match(/(\d+)\s*(?:h|hour|hours)/);
  const m = t.match(/(\d+)\s*(?:m|min|mins|minutes)/);
  if (h) mins += parseInt(h[1]) * 60;
  if (m) mins += parseInt(m[1]);
  if (!h && !m) {
    const n = t.match(/(\d+)/);
    if (n) mins = parseInt(n[1]);
  }
  if (!mins) return { ok: true, value: undefined };
  return { ok: true, value: mins };
}

function parseDueDate(raw: string) {
  const t = raw.toLowerCase().trim();
  if (!t || SKIP_RE.test(t)) return { ok: true, value: undefined };
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (/\btoday\b/.test(t)) return { ok: true, value: fmt(today) };
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { ok: true, value: fmt(d) };
  }
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${days[i]}\\b`).test(t)) {
      const d = new Date(today);
      const diff = (i - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return { ok: true, value: fmt(d) };
    }
  }
  // try Date.parse
  const parsed = Date.parse(raw);
  if (!isNaN(parsed)) return { ok: true, value: new Date(parsed).toISOString().slice(0, 10) };
  return { ok: true, value: undefined };
}

function parseDueTime(raw: string) {
  const t = raw.toLowerCase().trim();
  if (!t || SKIP_RE.test(t)) return { ok: true, value: undefined };
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return { ok: true, value: undefined };
  let h = parseInt(m[1]);
  const mm = m[2] ? parseInt(m[2]) : 0;
  const ap = m[3];
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || mm > 59) return { ok: true, value: undefined };
  return { ok: true, value: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
}

function parseLocation(raw: string) {
  const t = raw.trim();
  if (!t || SKIP_RE.test(t)) return { ok: true, value: undefined };
  return { ok: true, value: t.replace(/[.!?]+$/, "") };
}

function parseRecurrence(raw: string) {
  const t = raw.toLowerCase().trim();
  if (!t || SKIP_RE.test(t) || /\bone[- ]?off\b|\bonce\b|\bno\b/.test(t)) return { ok: true, value: "none" };
  if (/\bdaily\b|\bevery day\b/.test(t)) return { ok: true, value: "daily" };
  if (/\bweekly\b|\bevery week\b/.test(t)) return { ok: true, value: "weekly" };
  return { ok: true, value: "none" };
}

const STEPS: Step[] = [
  { key: "title", prompt: "What is the task?", required: true, parse: parseTitle },
  { key: "description", prompt: "Any extra details? Or say skip.", parse: parseDescription },
  {
    key: "categories",
    prompt:
      "Which categories? Say letters like A1, B2, C, or words like today, critical, quick, proud.",
    required: true,
    parse: parseCategories,
  },
  { key: "duration", prompt: "How long will it take? Say minutes, like 30 minutes, or skip.", parse: parseDuration },
  { key: "dueDate", prompt: "When is it due? Today, tomorrow, a weekday, or skip.", parse: parseDueDate },
  { key: "dueTime", prompt: "What time of day? Like 3 pm, or skip.", parse: parseDueTime },
  { key: "location", prompt: "Where does it happen? Say a place, or skip.", parse: parseLocation },
  { key: "recurrence", prompt: "Does it repeat? Say daily, weekly, or one off.", parse: parseRecurrence },
];

export default function VoiceTaskDialog({ onClose, onSave }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [values, setValues] = useState<Record<string, any>>({});
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const recognitionRef = useRef<any>(null);
  const supported =
    typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const step = STEPS[stepIdx];
  const done = stepIdx >= STEPS.length;

  const speak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  };

  // Speak prompt when step changes
  useEffect(() => {
    if (done) return;
    setTranscript("");
    setStatusMsg("");
    speak(step.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, done]);

  // Save when done
  useEffect(() => {
    if (!done) return;
    const cats: Category[] = values.categories || [];
    (async () => {
      const { data } = await supabase.auth.getUser();
      const task: Task = {
        id: uuid(),
        title: values.title,
        description: values.description,
        categories: cats,
        completed: false,
        createdAt: new Date().toISOString(),
        duration: values.duration,
        dueDate: values.dueDate,
        dueTime: values.dueTime,
        location: values.location,
        makesProud: cats.includes("H"),
        recurrence: values.recurrence && values.recurrence !== "none" ? values.recurrence : undefined,
        assigneeId: null,
        createdBy: data.user?.id,
      };
      speak(`Task ${task.title} saved.`);
      onSave(task);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const submitAnswer = (raw: string) => {
    const result = step.parse(raw);
    if (!result.ok) {
      setStatusMsg(result.error || "Please try again.");
      speak(result.error || "Please try again.");
      return;
    }
    if (step.required && (result.value === undefined || (Array.isArray(result.value) && result.value.length === 0))) {
      const err = "This field is required. " + step.prompt;
      setStatusMsg(err);
      speak(err);
      return;
    }
    setValues((v) => ({ ...v, [step.key]: result.value }));
    setStepIdx((i) => i + 1);
  };

  const startListening = () => {
    if (!supported) {
      setStatusMsg("Voice recognition not supported in this browser. Type your answer below.");
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript(finalText || interim);
    };
    rec.onend = () => {
      setListening(false);
      const text = (finalText || transcript).trim();
      if (text) submitAnswer(text);
    };
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    setTranscript("");
    rec.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
  };

  const [typed, setTyped] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Volume2 size={18} className="text-primary" /> Voice Task
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {!done ? (
          <>
            <div className="text-xs text-muted-foreground font-mono">
              Step {stepIdx + 1} / {STEPS.length} · {step.key}
              {step.required && <span className="text-destructive"> *</span>}
            </div>
            <div className="rounded-md bg-secondary border border-border p-3 text-sm text-foreground">
              {step.prompt}
            </div>

            {transcript && (
              <div className="rounded-md bg-primary/10 border border-primary/30 p-3 text-sm text-foreground">
                <span className="text-xs text-muted-foreground">Heard:</span> {transcript}
              </div>
            )}

            {statusMsg && <div className="text-xs text-destructive">{statusMsg}</div>}

            <div className="flex justify-center">
              <button
                onClick={listening ? stopListening : startListening}
                className={`flex items-center justify-center w-16 h-16 rounded-full transition-all ${
                  listening
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
                title={listening ? "Stop" : "Speak"}
              >
                {listening ? <MicOff size={28} /> : <Mic size={28} />}
              </button>
            </div>

            <div className="flex gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typed.trim()) {
                    submitAnswer(typed);
                    setTyped("");
                  }
                }}
                placeholder="…or type your answer"
                className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground"
              />
              <button
                onClick={() => {
                  if (typed.trim()) {
                    submitAnswer(typed);
                    setTyped("");
                  } else if (!step.required) {
                    submitAnswer("skip");
                  }
                }}
                className="bg-primary text-primary-foreground rounded px-3 text-sm flex items-center gap-1"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>

            {Object.keys(values).length > 0 && (
              <div className="border-t border-border pt-3 text-xs text-muted-foreground space-y-1">
                {Object.entries(values).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="font-mono w-24">{k}:</span>
                    <span className="text-foreground">
                      {Array.isArray(v)
                        ? v.map((c) => CATEGORY_META[c as Category]?.label || c).join(", ")
                        : String(v ?? "—")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-foreground py-6 text-center">Saving task…</div>
        )}
      </div>
    </div>
  );
}
