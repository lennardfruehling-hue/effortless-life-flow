import { useMemo, useState } from "react";
import { Task } from "@/lib/types";
import { Printer, Share2, ListChecks, Check } from "lucide-react";
import { format } from "date-fns";

interface Props {
  tasks: Task[];
  onToggle: (id: string) => void;
  onEdit?: (task: Task) => void;
}

/**
 * Serpent prioritization — picks the next-best N tasks based on the
 * organizational logic (A1 → B1 → A2/B2 → due-today → C quick-wins),
 * de-prioritizing avoid categories (I, F).
 */
function rankTask(t: Task): number {
  let score = 0;
  const c = new Set(t.categories);
  if (c.has("A1")) score += 1000;            // must-do today
  if (c.has("B1")) score += 700;             // critical consequence
  if (c.has("K")) score += 600;              // non-negotiable
  if (c.has("A2")) score += 400;             // this week
  if (c.has("B2")) score += 350;             // important
  if (c.has("C")) score += 120;              // quick win
  if (c.has("D")) score += 80;               // geographic cluster
  if (c.has("H")) score += 60;               // proud
  if (c.has("G")) score += 30;               // enjoy
  if (c.has("J")) score += 20;               // long-term
  if (c.has("E")) score -= 40;               // hate it
  if (c.has("F")) score -= 80;               // despise it
  if (c.has("I")) score -= 150;              // avoid
  if (c.has("A3")) score -= 20;              // no rush

  // Due-date pressure
  if (t.dueDate) {
    const days = Math.floor((new Date(t.dueDate).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) score += 500;
    else if (days <= 1) score += 250;
    else if (days <= 3) score += 120;
  }
  if (t.dueTime) score += 40;

  // Pride bonus (longer + proud = more)
  if (t.makesProud) score += 30 + Math.min(60, (t.duration ?? 0) / 2);

  return score;
}

export default function SerpentDailyList({ tasks, onToggle, onEdit }: Props) {
  const [open, setOpen] = useState(false);

  const { dailyRecurring, ranked, all } = useMemo(() => {
    const daily = tasks.filter((t) => t.recurrence === "daily");
    const rest = tasks
      .filter((t) => !t.completed && !t.recurrence)
      .map((t) => ({ t, s: rankTask(t) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t);
    return { dailyRecurring: daily, ranked: rest, all: [...daily, ...rest] };
  }, [tasks]);

  const today = format(new Date(), "EEE, d MMM");

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=420,height=600");
    if (!w) return;
    const rows = all.map((t, i) => `
      <li>
        <strong>${i + 1}.</strong> ${escapeHtml(t.title)}
        ${t.recurrence === "daily" ? '<span style="color:#0a7;font-size:9px;"> ↻ daily</span>' : ""}
        <span style="color:#777;font-size:10px;"> [${t.categories.join(" · ")}]</span>
      </li>`).join("");
    w.document.write(`<!doctype html><html><head><title>Serpent · ${today}</title>
      <style>
        body{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#111;padding:18px;}
        h1{font-size:13px;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;}
        .sub{color:#888;font-size:10px;margin-bottom:12px;}
        ol{padding:0;margin:0;list-style:none;}
        li{padding:6px 0;border-bottom:1px dashed #ddd;}
      </style></head><body>
      <h1>🐍 Serpent · Daily List</h1>
      <div class="sub">${today} · ${dailyRecurring.length} daily · ${ranked.length} prioritised</div>
      <ol>${rows}</ol>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const handleShare = async () => {
    const text = `🐍 Serpent · ${today}\n\n` +
      all.map((t, i) => `${i + 1}. ${t.title}${t.recurrence === "daily" ? " ↻" : ""}  [${t.categories.join("·")}]`).join("\n");
    if (navigator.share) {
      try { await navigator.share({ title: `Serpent · ${today}`, text }); return; } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      const el = document.getElementById("serpent-list-copied");
      if (el) { el.style.opacity = "1"; setTimeout(() => { el.style.opacity = "0"; }, 1400); }
    } catch { /* noop */ }
  };

  return (
    <div className="mb-4 rounded-md border border-border bg-card/40">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wider font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <ListChecks size={12} className="text-primary" />
        <span className="font-semibold">Serpent · Daily</span>
        <span className="opacity-50">·</span>
        <span className="opacity-60 normal-case tracking-normal">{today}</span>
        <span className="opacity-50">·</span>
        <span className="opacity-60 normal-case">{dailyRecurring.length} daily + {ranked.length} for today</span>
        <span className="ml-auto flex items-center gap-2">
          {open && (
            <>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); handlePrint(); }}
                className="hover:text-primary cursor-pointer"
                title="Print"
              >
                <Printer size={11} />
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); handleShare(); }}
                className="hover:text-primary cursor-pointer"
                title="Share / copy"
              >
                <Share2 size={11} />
              </span>
            </>
          )}
          <span className="text-[10px] opacity-60">{open ? "hide" : "show"}</span>
        </span>
      </button>

      {/* Body */}
      {open && (
        <ol className="px-3 pb-2 pt-0.5 space-y-0.5 text-[12px] font-mono leading-tight">
          {all.length === 0 && (
            <li className="text-muted-foreground italic text-[11px] py-1">
              Nothing prioritised — add daily recurring tasks or tasks with A1 / B1 / B2 categories.
            </li>
          )}
          {all.map((t, i) => (
            <li
              key={t.id}
              className="flex items-center gap-2 py-0.5 border-b border-dashed border-border/50 last:border-0"
            >
              <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
              <button
                onClick={() => onToggle(t.id)}
                className="flex-shrink-0 w-3.5 h-3.5 rounded-sm border border-border hover:border-primary flex items-center justify-center"
                title="Mark done"
              >
                {t.completed && <Check size={9} className="text-primary" />}
              </button>
              <span className={`flex-1 truncate ${t.completed ? "line-through text-muted-foreground" : ""}`}>
                {t.title}
              </span>
              {t.recurrence === "daily" && (
                <span className="text-[8px] text-emerald-500/80 tracking-wider uppercase">↻ daily</span>
              )}
              <span className="text-[9px] text-muted-foreground tracking-wider">
                {t.categories.slice(0, 3).join("·")}
              </span>
            </li>
          ))}
        </ol>
      )}

      <span
        id="serpent-list-copied"
        className="fixed bottom-4 right-4 text-[11px] bg-primary text-primary-foreground px-3 py-1.5 rounded shadow opacity-0 transition-opacity pointer-events-none z-50"
      >
        Copied to clipboard
      </span>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
