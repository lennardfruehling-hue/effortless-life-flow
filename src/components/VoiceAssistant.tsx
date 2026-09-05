import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Send, Trash2 } from "lucide-react";
import { Task, Project } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildVoiceState, describeAction, isMutatingAction, runVoiceActions, VoiceAction } from "@/lib/voiceActions";

interface Props {
  tasks: Task[];
  projects: Project[];
  onSaveTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onSaveProjects: React.Dispatch<React.SetStateAction<Project[]>>;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  actions?: string[];
  proposed?: VoiceAction[];
  status?: "pending" | "approved" | "declined";
}

function getRecognition(): any | null {
  const W = window as any;
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "en-US";
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

export default function VoiceAssistant({ tasks, projects, onSaveTasks, onSaveProjects }: Props) {
  const { user } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [speakBack, setSpeakBack] = useState(true);
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<any>(null);
  const handsFreeRef = useRef(false);
  const busyRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [turns, interim, busy]);

  const speak = useCallback((msg: string) => {
    if (!speakBack || !msg || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(msg);
    u.lang = "en-US";
    u.rate = 1.02;
    u.onend = () => {
      if (handsFreeRef.current) startListening();
    };
    window.speechSynthesis.speak(u);
  }, [speakBack]);

  const send = useCallback(async (utterance: string) => {
    const clean = utterance.trim();
    if (!clean || busyRef.current) return;
    setError(null);
    setBusy(true);
    setTurns((prev) => [...prev, { role: "user", text: clean }]);

    try {
      const ctx = {
        userId: user?.id,
        tasks,
        projects,
        setTasks: onSaveTasks,
        setProjects: onSaveProjects,
      };
      const state = await buildVoiceState(ctx);
      const history = turns.slice(-8).map((t) => ({ role: t.role, content: t.text }));
      const { data, error: fnErr } = await supabase.functions.invoke("serpent-voice", {
        body: {
          messages: [...history, { role: "user", content: clean }],
          state: JSON.stringify(state),
        },
      });
      if (fnErr) throw fnErr;

      const actions: VoiceAction[] = Array.isArray(data?.actions) ? data.actions : [];
      const applied = actions.length ? await runVoiceActions(actions, ctx) : [];
      const reply: string = data?.speak || (applied.length ? applied.join(". ") : "Done.");
      setTurns((prev) => [...prev, { role: "assistant", text: reply, actions: applied }]);
      speak(reply);
    } catch (e: any) {
      console.error("[voice] failed", e);
      const msg = "Sorry, I couldn't reach the assistant.";
      setError(e?.message ?? msg);
      setTurns((prev) => [...prev, { role: "assistant", text: msg }]);
      speak(msg);
    } finally {
      setBusy(false);
      if (handsFreeRef.current && !speakBack) startListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, projects, onSaveTasks, onSaveProjects, user?.id, turns, speak, speakBack]);

  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      setError("Microphone access is blocked. Allow microphone permission for this app to use voice.");
      setHandsFree(false);
      handsFreeRef.current = false;
      return false;
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!supported || busyRef.current) return;
    if (!(await ensureMicPermission())) return;
    try { recRef.current?.abort?.(); } catch {}
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    let finalText = "";
    rec.onresult = (ev: any) => {
      let inter = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else inter += res[0].transcript;
      }
      setInterim(inter);
    };
    rec.onerror = (ev: any) => {
      if (ev?.error === "not-allowed") {
        setError("Microphone permission denied.");
        setHandsFree(false);
      }
      setListening(false);
      setInterim("");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      const said = finalText.trim();
      if (said) send(said);
      else if (handsFreeRef.current && !busyRef.current) setTimeout(() => startListening(), 400);
    };
    try {
      rec.start();
      setListening(true);
    } catch {}
  }, [supported, send, ensureMicPermission]);

  const stopListening = useCallback(() => {
    handsFreeRef.current = false;
    setHandsFree(false);
    try { recRef.current?.stop?.(); } catch {}
    setListening(false);
  }, []);

  useEffect(() => () => {
    try { recRef.current?.abort?.(); } catch {}
    window.speechSynthesis?.cancel();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Voice control</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSpeakBack((v) => !v)}
            title={speakBack ? "Mute spoken replies" : "Enable spoken replies"}
            className="p-1 text-muted-foreground hover:text-primary"
          >
            {speakBack ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button
            onClick={() => { setTurns([]); window.speechSynthesis?.cancel(); }}
            title="Clear conversation"
            className="p-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm">
        {turns.length === 0 && (
          <div className="text-xs text-muted-foreground space-y-2">
            <p>Talk to Serpent — it can create and edit anything: tasks, projects, reminders, calendar events, notes, lists, habits, cars and apartments.</p>
            <ul className="space-y-1 font-mono text-[11px]">
              <li>“Add task call the garage tomorrow at 9, category A1.”</li>
              <li>“Mark grocery shopping as done.”</li>
              <li>“Create a daily habit called stretching at 7am and push it to tasks.”</li>
              <li>“Move the Rathmines apartment to viewing scheduled.”</li>
              <li>“Open the calendar.”</li>
            </ul>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : ""}>
            <div
              className={
                t.role === "user"
                  ? "inline-block rounded-lg bg-primary text-primary-foreground px-3 py-1.5 max-w-[85%] text-left"
                  : "text-foreground"
              }
            >
              {t.text}
            </div>
            {t.actions && t.actions.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {t.actions.map((a, j) => (
                  <li key={j} className="text-[11px] font-mono text-emerald-500">✓ {a}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {interim && <p className="text-muted-foreground italic text-right">{interim}</p>}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Thinking…
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {!supported && (
          <p className="text-[11px] text-muted-foreground">
            Voice input isn't supported in this browser — type below instead.
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            disabled={!supported || busy}
            onClick={() => (listening ? stopListening() : startListening())}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
            {listening ? "Listening…" : "Talk"}
          </button>
          <button
            disabled={!supported}
            onClick={() => {
              const next = !handsFree;
              setHandsFree(next);
              handsFreeRef.current = next;
              if (next) startListening();
              else stopListening();
            }}
            title="Hands-free conversation mode"
            className={`rounded-lg px-2.5 py-2 text-xs font-medium border transition-colors disabled:opacity-50 ${
              handsFree ? "bg-emerald-500/20 border-emerald-400 text-emerald-500" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Hands-free
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); const v = text; setText(""); send(v); }}
          className="flex items-center gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="…or type a command"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <button type="submit" disabled={busy || !text.trim()} className="p-2 text-primary disabled:opacity-40">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
