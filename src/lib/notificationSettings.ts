// User-controlled notification & email reminder settings.
// Stored in localStorage. The user picks which categories of reminders are
// allowed to send emails (in addition to in-app alerts).

export interface NotificationSettings {
  /** Master switch: send any emails at all */
  emailEnabled: boolean;
  /** Email weekly recurring tasks (a.k.a. "Weekly Intentions") not done yet */
  emailWeeklyIntentions: boolean;
  /** Email daily recurring tasks not done by evening cutoff */
  emailDailyRecurring: boolean;
  /** Email one-off reminders when they fire */
  emailReminders: boolean;
  /** Email when a task / note is assigned to you */
  emailAssignments: boolean;
  /** Override target email (defaults to signed-in user's email) */
  targetEmail?: string;
  /** Day-of-week index (0=Sun..6=Sat) to start warning for incomplete weekly */
  weeklyWarningStartDay: number;
  /** Hour of day (0-23) to issue weekly warnings */
  weeklyWarningHour: number;
}

const KEY = "serpent-notification-settings-v1";
const EVT = "serpent-notification-settings-changed";

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailEnabled: true,
  emailWeeklyIntentions: true,
  emailDailyRecurring: false,
  emailReminders: true,
  emailAssignments: false,
  weeklyWarningStartDay: 4, // Thursday
  weeklyWarningHour: 18,
};

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function saveNotificationSettings(s: NotificationSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(EVT, { detail: s }));
}

export function onNotificationSettingsChange(cb: (s: NotificationSettings) => void): () => void {
  const handler = () => cb(loadNotificationSettings());
  window.addEventListener(EVT, handler as EventListener);
  const storage = (e: StorageEvent) => { if (e.key === KEY) cb(loadNotificationSettings()); };
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVT, handler as EventListener);
    window.removeEventListener("storage", storage);
  };
}
