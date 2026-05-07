import { useState, useRef } from "react";
import { CalendarEvent, Task, WeeklyStructureBlock, DailyScheduleSlot } from "@/lib/types";
import { ChevronLeft, ChevronRight, Upload, Download, Plus, Trash2, X, CalendarDays, LayoutGrid } from "lucide-react";
import { v4 as uuid } from "uuid";
import GoogleCalendarConnect from "./GoogleCalendarConnect";
import WeeklyStructureView from "./WeeklyStructureView";

interface CalendarViewProps {
  events: CalendarEvent[];
  onSave: (events: CalendarEvent[]) => void;
  tasks?: Task[];
  weeklyStructure?: WeeklyStructureBlock[];
  onSaveWeeklyStructure?: (b: WeeklyStructureBlock[]) => void;
  dailySchedule?: DailyScheduleSlot[];
  onSaveDailySchedule?: (s: DailyScheduleSlot[]) => void;
}

function parseICS(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const blocks = text.split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const get = (key: string) => {
      const match = block.match(new RegExp(`${key}[^:]*:(.+)`, "m"));
      return match ? match[1].trim() : "";
    };
    const summary = get("SUMMARY");
    const dtstart = get("DTSTART");
    const dtend = get("DTEND");
    const description = get("DESCRIPTION");
    if (summary && dtstart) {
      const parseDate = (d: string) => {
        const clean = d.replace(/[TZ]/g, (m) => m === "T" ? "T" : "");
        if (d.length === 8) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00`;
        return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(9,11)}:${d.slice(11,13)}`;
      };
      events.push({
        id: uuid(),
        title: summary.replace(/\\,/g, ",").replace(/\\n/g, " "),
        description: description ? description.replace(/\\,/g, ",").replace(/\\n/g, "\n") : undefined,
        start: parseDate(dtstart),
        end: dtend ? parseDate(dtend) : parseDate(dtstart),
        allDay: dtstart.length === 8,
        source: "ics",
      });
    }
  }
  return events;
}

function toICS(events: CalendarEvent[]): string {
  const fmt = (d: string) => {
    const dt = new Date(d);
    return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SerpentList//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@serpentlist`);
    lines.push(`DTSTART:${fmt(e.start)}`);
    lines.push(`DTEND:${fmt(e.end)}`);
    lines.push(`SUMMARY:${e.title.replace(/,/g, "\\,")}`);
    if (e.description) lines.push(`DESCRIPTION:${e.description.replace(/\n/g, "\\n").replace(/,/g, "\\,")}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function CalendarView({ events, onSave, tasks = [], weeklyStructure = [], onSaveWeeklyStructure, dailySchedule = [], onSaveDailySchedule }: CalendarViewProps) {
  const [tab, setTab] = useState<"month" | "week">("month");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formAllDay, setFormAllDay] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return events.filter(e => e.start.startsWith(dateStr));
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const imported = parseICS(text);
      if (imported.length > 0) {
        onSave([...events, ...imported]);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExport = () => {
    const ics = toICS(events);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "serpent-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const addEvent = () => {
    if (!formTitle.trim() || !formStart) return;
    onSave([...events, {
      id: uuid(),
      title: formTitle.trim(),
      start: formStart,
      end: formEnd || formStart,
      allDay: formAllDay,
      source: "manual",
    }]);
    setFormTitle("");
    setFormStart("");
    setFormEnd("");
    setShowForm(false);
  };

  const deleteEvent = (id: string) => {
    onSave(events.filter(e => e.id !== id));
  };

  const selectedDateEvents = selectedDate
    ? events.filter(e => e.start.startsWith(selectedDate))
    : [];

  return (
    <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Calendar</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{events.length} events</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".ics,.ical" onChange={handleImport} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors">
            <Upload size={14} /> Import ICS
          </button>
          <button onClick={handleExport} disabled={events.length === 0} className="flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
            <Download size={14} /> Export ICS
          </button>
          <GoogleCalendarConnect events={events} onSave={onSave} />
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-md text-xs font-medium hover:opacity-90 transition-opacity">
            <Plus size={14} /> Add Event
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setTab("month")}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 -mb-px transition-colors ${
            tab === "month" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid size={12} /> Month
        </button>
        <button
          onClick={() => setTab("week")}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 -mb-px transition-colors ${
            tab === "week" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarDays size={12} /> Weekly Structure
        </button>
      </div>

      {tab === "week" && onSaveWeeklyStructure && onSaveDailySchedule && (
        <WeeklyStructureView
          blocks={weeklyStructure}
          onSave={onSaveWeeklyStructure}
          tasks={tasks}
          dailySchedule={dailySchedule}
          onSaveDailySchedule={onSaveDailySchedule}
        />
      )}

      {tab === "month" && (<>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="p-1 text-muted-foreground hover:text-foreground"><ChevronLeft size={20} /></button>
        <h3 className="text-lg font-semibold text-foreground">{MONTHS[month]} {year}</h3>
        <button onClick={next} className="p-1 text-muted-foreground hover:text-foreground"><ChevronRight size={20} /></button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden mb-6">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="bg-secondary px-2 py-2 text-xs font-medium text-muted-foreground text-center">{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-card min-h-[80px]" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const dayEvents = getEventsForDay(day);
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          return (
            <div
              key={day}
              onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              className={`bg-card min-h-[80px] p-1.5 cursor-pointer hover:bg-secondary/50 transition-colors ${isSelected ? "ring-1 ring-primary" : ""}`}
            >
              <span className={`text-xs font-mono block mb-1 ${isToday ? "bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center" : "text-muted-foreground"}`}>
                {day}
              </span>
              {dayEvents.slice(0, 3).map(e => (
                <div key={e.id} className="text-[10px] bg-primary/10 text-primary rounded px-1 py-0.5 truncate mb-0.5">{e.title}</div>
              ))}
              {dayEvents.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</span>}
            </div>
          );
        })}
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div className="bg-card border border-border rounded-lg p-4 mb-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">{selectedDate}</h4>
          {selectedDateEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events</p>
          ) : (
            <div className="space-y-2">
              {selectedDateEvents.map(e => (
                <div key={e.id} className="flex items-start justify-between gap-2 p-2 bg-secondary/50 rounded">
                  <div>
                    <p className="text-sm font-medium text-foreground">{e.title}</p>
                    {!e.allDay && <p className="text-xs text-muted-foreground font-mono">{e.start.slice(11, 16)} – {e.end.slice(11, 16)}</p>}
                    {e.description && <p className="text-xs text-muted-foreground mt-1">{e.description}</p>}
                  </div>
                  <button onClick={() => deleteEvent(e.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </>)}

      {/* Add event modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">New Event</h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Event title" className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" autoFocus />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">
                <input type="checkbox" checked={formAllDay} onChange={e => setFormAllDay(e.target.checked)} className="mr-1 accent-primary" />
                All day
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Start</label>
                <input type={formAllDay ? "date" : "datetime-local"} value={formStart} onChange={e => setFormStart(e.target.value)} className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">End</label>
                <input type={formAllDay ? "date" : "datetime-local"} value={formEnd} onChange={e => setFormEnd(e.target.value)} className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <button onClick={addEvent} disabled={!formTitle.trim() || !formStart} className="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity">
              Add Event
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
