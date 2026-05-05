import { supabase } from "@/integrations/supabase/client";

export const CLOUD_KEYS = {
  tasks: "serpent-tasks",
  projects: "serpent-projects",
  reminders: "serpent-reminders",
  lifeplan: "serpent-lifeplan",
  lifeplanV2: "serpent-lifeplan-v2",
  research: "serpent-research",
  chatHistory: "serpent-chat-history",
  calendarEvents: "serpent-calendar-events",
  dailySchedule: "serpent-daily-schedule",
} as const;

export async function cloudGet<T>(userId: string, key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from("user_data")
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return (data.value as T) ?? fallback;
}

export async function cloudSet<T>(userId: string, key: string, value: T): Promise<void> {
  await supabase.from("user_data").upsert(
    { user_id: userId, key, value: value as any, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" }
  );
}

/** Migrate any existing localStorage values to cloud (only if cloud is empty for that key). */
export async function migrateLocalToCloud(userId: string) {
  const flagKey = `serpent-migrated-${userId}`;
  if (localStorage.getItem(flagKey)) return;
  for (const key of Object.values(CLOUD_KEYS)) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const existing = await cloudGet<unknown>(userId, key, null as any);
      const empty =
        existing === null ||
        existing === undefined ||
        (Array.isArray(existing) && existing.length === 0) ||
        (typeof existing === "object" && existing && Object.keys(existing as any).length === 0);
      if (empty) await cloudSet(userId, key, parsed);
    } catch {}
  }
  localStorage.setItem(flagKey, "1");
}
