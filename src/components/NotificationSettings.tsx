import { useState } from "react";
import { X, Mail } from "lucide-react";
import {
  NotificationSettings,
  loadNotificationSettings,
  saveNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from "@/lib/notificationSettings";
import { useAuth } from "@/hooks/useAuth";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [s, setS] = useState<NotificationSettings>(() => loadNotificationSettings());

  const update = <K extends keyof NotificationSettings>(k: K, v: NotificationSettings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  const handleSave = () => {
    saveNotificationSettings(s);
    onClose();
  };
  const handleReset = () => setS({ ...DEFAULT_NOTIFICATION_SETTINGS });

  const Row = ({
    label, desc, checked, onChange, disabled,
  }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <label className={`flex items-start gap-3 py-2 cursor-pointer select-none ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span className="flex-1">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-[10px] text-muted-foreground mt-0.5">{desc}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Mail size={18} /> Reminders & Emails
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose which alerts should also be sent to your email.
        </p>

        <Row
          label="Send emails"
          desc="Master switch. Disable to keep in-app alerts only."
          checked={s.emailEnabled}
          onChange={(v) => update("emailEnabled", v)}
        />

        <div className="border-t border-border pt-2 space-y-0">
          <Row
            label="Weekly intentions"
            desc="Email when weekly recurring tasks aren't done yet."
            checked={s.emailWeeklyIntentions}
            onChange={(v) => update("emailWeeklyIntentions", v)}
            disabled={!s.emailEnabled}
          />
          <Row
            label="Daily recurring tasks"
            desc="Email if daily tasks aren't done by the evening cutoff."
            checked={s.emailDailyRecurring}
            onChange={(v) => update("emailDailyRecurring", v)}
            disabled={!s.emailEnabled}
          />
          <Row
            label="One-off reminders"
            desc="Email when scheduled reminders fire."
            checked={s.emailReminders}
            onChange={(v) => update("emailReminders", v)}
            disabled={!s.emailEnabled}
          />
          <Row
            label="Assignments"
            desc="Email when a task or note is assigned to you."
            checked={s.emailAssignments}
            onChange={(v) => update("emailAssignments", v)}
            disabled={!s.emailEnabled}
          />
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
            Weekly warning timing
          </label>
          <div className="flex gap-2">
            <select
              value={s.weeklyWarningStartDay}
              onChange={(e) => update("weeklyWarningStartDay", Number(e.target.value))}
              className="flex-1 bg-secondary border border-border rounded px-2 py-1.5 text-sm"
            >
              {DAYS.map((d, i) => (
                <option key={i} value={i}>From {d}</option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={23}
              value={s.weeklyWarningHour}
              onChange={(e) => update("weeklyWarningHour", Math.max(0, Math.min(23, Number(e.target.value))))}
              className="w-20 bg-secondary border border-border rounded px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-muted-foreground self-center">:00</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Starting this day & hour each week, undone weekly tasks trigger a warning + email (once per task per week).
          </p>
        </div>

        <div className="border-t border-border pt-3">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono block mb-1">
            Target email
          </label>
          <input
            type="email"
            placeholder={user?.email ?? "you@example.com"}
            value={s.targetEmail ?? ""}
            onChange={(e) => update("targetEmail", e.target.value || undefined)}
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Leave empty to use your account email ({user?.email || "—"}).
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Save
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
