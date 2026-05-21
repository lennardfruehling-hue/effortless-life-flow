import { useMemo, useState } from "react";
import { useCloudState } from "@/hooks/useCloudState";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { Task, Reminder } from "@/lib/types";
import { Car, Plus, Trash2, Wrench, CalendarClock, Gauge, FileText, Send, ChevronRight, ChevronDown } from "lucide-react";
import { v4 as uuid } from "uuid";
import { format, parseISO, differenceInDays } from "date-fns";

interface CarRecord {
  id: string;
  name: string;
  make?: string;
  model?: string;
  year?: string;
  plate?: string;
  vin?: string;
  mileage?: number;
  notes?: string;
}

interface ServiceLog {
  id: string;
  carId: string;
  date: string;        // YYYY-MM-DD
  type: string;        // Oil change, Tire rotation...
  mileage?: number;
  cost?: number;
  vendor?: string;
  notes?: string;
}

interface ScheduledService {
  id: string;
  carId: string;
  type: string;
  dueDate?: string;     // YYYY-MM-DD
  dueMileage?: number;
  notes?: string;
  pushedTaskId?: string;
  pushedReminderId?: string;
}

interface Cars {
  cars: CarRecord[];
  logs: ServiceLog[];
  scheduled: ScheduledService[];
}

const DEFAULT: Cars = { cars: [], logs: [], scheduled: [] };

const COMMON_SERVICES = [
  "Oil change", "Tire rotation", "Brake inspection", "Brake pads", "Air filter",
  "Cabin filter", "Coolant flush", "Transmission fluid", "Spark plugs", "Battery check",
  "Wiper blades", "Alignment", "Inspection / MOT", "Insurance renewal", "Registration",
];

interface Props {
  tasks: Task[];
  onSaveTasks: (t: Task[]) => void;
  reminders: Reminder[];
  onSaveReminders: (r: Reminder[]) => void;
}

export default function CarMaintenanceView({ tasks, onSaveTasks, reminders, onSaveReminders }: Props) {
  const [data, setData, loaded] = useCloudState<Cars>(CLOUD_KEYS.cars, DEFAULT);
  const [activeCarId, setActiveCarId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "log" | "scheduled">("overview");
  const [openLog, setOpenLog] = useState(false);
  const [openSched, setOpenSched] = useState(false);

  // Normalize loaded shape
  const cars = data?.cars ?? [];
  const logs = data?.logs ?? [];
  const scheduled = data?.scheduled ?? [];
  const activeCar = cars.find(c => c.id === activeCarId) ?? cars[0];

  const update = (patch: Partial<Cars>) => setData({ cars, logs, scheduled, ...patch });

  const addCar = () => {
    const c: CarRecord = { id: uuid(), name: "New Car" };
    update({ cars: [...cars, c] });
    setActiveCarId(c.id);
  };
  const patchCar = (id: string, patch: Partial<CarRecord>) =>
    update({ cars: cars.map(c => c.id === id ? { ...c, ...patch } : c) });
  const deleteCar = (id: string) => {
    if (!confirm("Delete this car and all its records?")) return;
    update({
      cars: cars.filter(c => c.id !== id),
      logs: logs.filter(l => l.carId !== id),
      scheduled: scheduled.filter(s => s.carId !== id),
    });
    if (activeCarId === id) setActiveCarId(null);
  };

  const addLog = (log: Omit<ServiceLog, "id">) =>
    update({ logs: [{ ...log, id: uuid() }, ...logs] });
  const deleteLog = (id: string) => update({ logs: logs.filter(l => l.id !== id) });

  const addScheduled = (s: Omit<ScheduledService, "id">) =>
    update({ scheduled: [{ ...s, id: uuid() }, ...scheduled] });
  const patchScheduled = (id: string, patch: Partial<ScheduledService>) =>
    update({ scheduled: scheduled.map(s => s.id === id ? { ...s, ...patch } : s) });
  const deleteScheduled = (id: string) => update({ scheduled: scheduled.filter(s => s.id !== id) });

  /** Push scheduled service → Task + Reminder. */
  const pushToTask = (s: ScheduledService) => {
    const car = cars.find(c => c.id === s.carId);
    const title = `🚗 ${car?.name ?? "Car"} — ${s.type}`;
    const taskId = uuid();
    const newTask: Task = {
      id: taskId,
      title,
      description: [
        s.dueMileage ? `Due at ${s.dueMileage.toLocaleString()} km/mi` : null,
        s.notes,
      ].filter(Boolean).join("\n"),
      categories: ["B2"],
      completed: false,
      createdAt: new Date().toISOString(),
      dueDate: s.dueDate,
    };
    onSaveTasks([...tasks, newTask]);

    let reminderId: string | undefined;
    if (s.dueDate) {
      reminderId = uuid();
      const reminderDt = `${s.dueDate}T09:00`;
      const newReminder: Reminder = {
        id: reminderId,
        title,
        datetime: reminderDt,
        taskId,
        completed: false,
      };
      onSaveReminders([...reminders, newReminder]);
    }
    patchScheduled(s.id, { pushedTaskId: taskId, pushedReminderId: reminderId });
  };

  const carLogs = useMemo(
    () => logs.filter(l => activeCar && l.carId === activeCar.id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [logs, activeCar]
  );
  const carScheduled = useMemo(
    () => scheduled.filter(s => activeCar && s.carId === activeCar.id)
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
    [scheduled, activeCar]
  );

  if (!loaded) {
    return <div className="p-8 text-sm text-muted-foreground">Loading car records…</div>;
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Car list */}
      <div className="w-56 lg:w-64 flex-shrink-0 border-r border-border bg-card/40 flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2"><Car size={15} className="text-primary" /> My Cars</h2>
          <button onClick={addCar} className="bg-primary text-primary-foreground p-1.5 rounded hover:opacity-90" title="Add car">
            <Plus size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {cars.length === 0 && <p className="text-xs text-muted-foreground text-center py-6 px-2">Add a car to start tracking maintenance, services, and renewals.</p>}
          {cars.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCarId(c.id)}
              className={`w-full text-left px-2 py-2 rounded text-sm group transition-colors ${
                activeCar?.id === c.id ? "bg-primary/15 text-primary" : "hover:bg-secondary"
              }`}
            >
              <div className="flex items-center gap-2">
                <Car size={13} />
                <span className="truncate flex-1 text-xs font-medium">{c.name || "Untitled"}</span>
                <Trash2
                  size={11}
                  onClick={(e) => { e.stopPropagation(); deleteCar(c.id); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                />
              </div>
              {(c.make || c.model) && (
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate ml-5">
                  {[c.year, c.make, c.model].filter(Boolean).join(" ")}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto">
        {!activeCar ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Car size={56} className="text-primary/20 mb-4" />
            <p className="text-muted-foreground">Select or add a car</p>
            <p className="text-xs text-muted-foreground mt-1">Track maintenance, services & renewals</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
            {/* Header */}
            <div>
              <input
                value={activeCar.name}
                onChange={(e) => patchCar(activeCar.id, { name: e.target.value })}
                placeholder="Car name"
                className="text-2xl font-bold bg-transparent w-full outline-none focus:bg-secondary/50 px-1 rounded"
              />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                <Field label="Year" value={activeCar.year} onChange={(v) => patchCar(activeCar.id, { year: v })} />
                <Field label="Make" value={activeCar.make} onChange={(v) => patchCar(activeCar.id, { make: v })} />
                <Field label="Model" value={activeCar.model} onChange={(v) => patchCar(activeCar.id, { model: v })} />
                <Field label="Plate" value={activeCar.plate} onChange={(v) => patchCar(activeCar.id, { plate: v })} />
                <Field label="VIN" value={activeCar.vin} onChange={(v) => patchCar(activeCar.id, { vin: v })} />
                <Field
                  label="Mileage"
                  value={activeCar.mileage?.toString() ?? ""}
                  onChange={(v) => patchCar(activeCar.id, { mileage: v ? Number(v) : undefined })}
                  type="number"
                />
              </div>
              <textarea
                value={activeCar.notes ?? ""}
                onChange={(e) => patchCar(activeCar.id, { notes: e.target.value })}
                placeholder="Notes (insurance, fuel, parking, key locations…)"
                rows={2}
                className="mt-2 w-full text-sm bg-secondary/30 rounded p-2 outline-none focus:bg-secondary/50"
              />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border">
              {([
                { id: "overview", label: "Overview", icon: Gauge },
                { id: "scheduled", label: "Upcoming", icon: CalendarClock },
                { id: "log", label: "Service Log", icon: Wrench },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${
                    tab === t.id ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <OverviewPanel car={activeCar} logs={carLogs} scheduled={carScheduled} />
            )}

            {tab === "scheduled" && (
              <div className="space-y-3">
                <button
                  onClick={() => setOpenSched(v => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
                >
                  {openSched ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Plus size={14} /> Schedule a service
                </button>
                {openSched && (
                  <ScheduleForm
                    onAdd={(s) => { addScheduled({ ...s, carId: activeCar.id }); setOpenSched(false); }}
                  />
                )}
                <div className="space-y-2">
                  {carScheduled.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No upcoming services. Plan oil changes, inspections, insurance renewals…</p>
                  )}
                  {carScheduled.map(s => {
                    const daysLeft = s.dueDate ? differenceInDays(parseISO(s.dueDate), new Date()) : null;
                    const overdue = daysLeft !== null && daysLeft < 0;
                    const soon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;
                    return (
                      <div key={s.id} className={`p-3 rounded-lg border ${overdue ? "border-destructive/60 bg-destructive/5" : soon ? "border-amber-500/60 bg-amber-500/5" : "border-border bg-card"}`}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{s.type}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                              {s.dueDate && (
                                <span>
                                  <CalendarClock size={10} className="inline mr-1" />
                                  {format(parseISO(s.dueDate), "PPP")}
                                  {daysLeft !== null && (
                                    <span className={`ml-1 ${overdue ? "text-destructive font-medium" : soon ? "text-amber-600 font-medium" : ""}`}>
                                      ({overdue ? `${-daysLeft}d overdue` : daysLeft === 0 ? "today" : `in ${daysLeft}d`})
                                    </span>
                                  )}
                                </span>
                              )}
                              {s.dueMileage && <span><Gauge size={10} className="inline mr-1" />{s.dueMileage.toLocaleString()}</span>}
                            </div>
                            {s.notes && <div className="text-xs text-muted-foreground mt-1">{s.notes}</div>}
                            {s.pushedTaskId && (
                              <div className="text-[10px] text-emerald-600 mt-1 font-medium">✓ Pushed to Tasks{s.pushedReminderId ? " + Reminder" : ""}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {!s.pushedTaskId && (
                              <button
                                onClick={() => pushToTask(s)}
                                className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90 flex items-center gap-1"
                                title="Push to Tasks and create a reminder"
                              >
                                <Send size={11} /> Push
                              </button>
                            )}
                            <button onClick={() => deleteScheduled(s.id)} className="text-muted-foreground hover:text-destructive p-1">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "log" && (
              <div className="space-y-3">
                <button
                  onClick={() => setOpenLog(v => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80"
                >
                  {openLog ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Plus size={14} /> Log a service
                </button>
                {openLog && (
                  <LogForm
                    defaultMileage={activeCar.mileage}
                    onAdd={(l) => {
                      addLog({ ...l, carId: activeCar.id });
                      if (l.mileage && (!activeCar.mileage || l.mileage > activeCar.mileage)) {
                        patchCar(activeCar.id, { mileage: l.mileage });
                      }
                      setOpenLog(false);
                    }}
                  />
                )}
                <div className="space-y-2">
                  {carLogs.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No service history yet. Log past oil changes, repairs, tire swaps…</p>
                  )}
                  {carLogs.map(l => (
                    <div key={l.id} className="p-3 rounded-lg border border-border bg-card">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{l.type}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                            <span>{format(parseISO(l.date), "PPP")}</span>
                            {l.mileage && <span><Gauge size={10} className="inline mr-1" />{l.mileage.toLocaleString()}</span>}
                            {l.cost !== undefined && <span>${l.cost.toFixed(2)}</span>}
                            {l.vendor && <span>· {l.vendor}</span>}
                          </div>
                          {l.notes && <div className="text-xs text-muted-foreground mt-1 flex gap-1"><FileText size={10} className="mt-0.5 flex-shrink-0" />{l.notes}</div>}
                        </div>
                        <button onClick={() => deleteLog(l.id)} className="text-muted-foreground hover:text-destructive p-1">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value?: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm bg-secondary/30 rounded px-2 py-1 outline-none focus:bg-secondary/50 mt-0.5"
      />
    </label>
  );
}

function OverviewPanel({ car, logs, scheduled }: { car: CarRecord; logs: ServiceLog[]; scheduled: ScheduledService[] }) {
  const totalCost = logs.reduce((s, l) => s + (l.cost ?? 0), 0);
  const nextDue = scheduled.find(s => s.dueDate);
  const lastService = logs[0];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="Current mileage" value={car.mileage?.toLocaleString() ?? "—"} />
      <Stat label="Service entries" value={logs.length.toString()} />
      <Stat label="Total spent" value={totalCost > 0 ? `$${totalCost.toFixed(0)}` : "—"} />
      <Stat label="Last service" value={lastService ? format(parseISO(lastService.date), "MMM d") : "—"} />
      {nextDue && (
        <div className="col-span-2 md:col-span-4 p-3 rounded-lg bg-primary/10 border border-primary/30">
          <div className="text-[10px] uppercase tracking-wider text-primary font-semibold">Next due</div>
          <div className="text-sm font-medium mt-0.5">{nextDue.type} — {format(parseISO(nextDue.dueDate!), "PPP")}</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/40 border border-border">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-lg font-bold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function ScheduleForm({ onAdd }: { onAdd: (s: Omit<ScheduledService, "id" | "carId">) => void }) {
  const [type, setType] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueMileage, setDueMileage] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div className="p-3 rounded-lg border border-border bg-card space-y-2">
      <ServiceTypeInput value={type} onChange={setType} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Due date</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full text-sm bg-secondary/30 rounded px-2 py-1 outline-none mt-0.5" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Due mileage</span>
          <input type="number" value={dueMileage} onChange={(e) => setDueMileage(e.target.value)} className="w-full text-sm bg-secondary/30 rounded px-2 py-1 outline-none mt-0.5" />
        </label>
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full text-sm bg-secondary/30 rounded p-2 outline-none" />
      <button
        disabled={!type.trim()}
        onClick={() => {
          onAdd({
            type: type.trim(),
            dueDate: dueDate || undefined,
            dueMileage: dueMileage ? Number(dueMileage) : undefined,
            notes: notes.trim() || undefined,
          });
          setType(""); setDueDate(""); setDueMileage(""); setNotes("");
        }}
        className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 hover:opacity-90"
      >
        Add to schedule
      </button>
    </div>
  );
}

function LogForm({ onAdd, defaultMileage }: { onAdd: (l: Omit<ServiceLog, "id" | "carId">) => void; defaultMileage?: number }) {
  const [type, setType] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [mileage, setMileage] = useState(defaultMileage?.toString() ?? "");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div className="p-3 rounded-lg border border-border bg-card space-y-2">
      <ServiceTypeInput value={type} onChange={setType} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-sm bg-secondary/30 rounded px-2 py-1 mt-0.5 outline-none" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Mileage</span>
          <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} className="w-full text-sm bg-secondary/30 rounded px-2 py-1 mt-0.5 outline-none" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cost</span>
          <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full text-sm bg-secondary/30 rounded px-2 py-1 mt-0.5 outline-none" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Vendor</span>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full text-sm bg-secondary/30 rounded px-2 py-1 mt-0.5 outline-none" />
        </label>
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (parts replaced, observations…)" rows={2} className="w-full text-sm bg-secondary/30 rounded p-2 outline-none" />
      <button
        disabled={!type.trim() || !date}
        onClick={() => {
          onAdd({
            type: type.trim(),
            date,
            mileage: mileage ? Number(mileage) : undefined,
            cost: cost ? Number(cost) : undefined,
            vendor: vendor.trim() || undefined,
            notes: notes.trim() || undefined,
          });
          setType(""); setMileage(""); setCost(""); setVendor(""); setNotes("");
        }}
        className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 hover:opacity-90"
      >
        Log service
      </button>
    </div>
  );
}

function ServiceTypeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Service type</span>
        <input
          list="car-service-types"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Oil change"
          className="w-full text-sm bg-secondary/30 rounded px-2 py-1 mt-0.5 outline-none"
        />
      </label>
      <datalist id="car-service-types">
        {COMMON_SERVICES.map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
