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

// Per-user-only keys (do NOT merge across household — these are personal).
const PERSONAL_KEYS: string[] = [
  CLOUD_KEYS.chatHistory,
  CLOUD_KEYS.dailySchedule,
];

/** Get caller's row only (used for personal keys and writes). */
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

/**
 * Get a household-merged value: combines arrays from every member, deduping by `id` field.
 * For non-array values, returns the most recently updated one.
 */
export async function cloudGetShared<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from("user_data")
    .select("value, updated_at, user_id")
    .eq("key", key)
    .order("updated_at", { ascending: false });
  if (error || !data || data.length === 0) return fallback;

  const values = data.map(r => r.value);
  // If first value is an array, merge all arrays deduping by id.
  if (Array.isArray(values[0])) {
    const merged: any[] = [];
    const seen = new Set<string>();
    for (const v of values) {
      if (!Array.isArray(v)) continue;
      for (const item of v as any[]) {
        const id = (item && typeof item === "object" && "id" in item) ? String((item as any).id) : JSON.stringify(item);
        if (seen.has(id)) continue;
        seen.add(id);
        merged.push(item);
      }
    }
    return merged as unknown as T;
  }
  // Otherwise newest wins.
  return (values[0] as T) ?? fallback;
}

export async function cloudSet<T>(userId: string, key: string, value: T): Promise<void> {
  let toWrite: any = value;
  // For SHARED array keys, merge with current cloud value so a stale local cache
  // can never wipe out items added by another device sharing this account.
  if (!isPersonalKey(key) && Array.isArray(value)) {
    try {
      const { data } = await supabase
        .from("user_data")
        .select("value")
        .eq("user_id", userId)
        .eq("key", key)
        .maybeSingle();
      const cloudArr = Array.isArray(data?.value) ? (data!.value as any[]) : [];
      const localArr = value as any[];
      const localIds = new Set(
        localArr
          .map(it => (it && typeof it === "object" && "id" in it) ? String(it.id) : null)
          .filter(Boolean) as string[]
      );
      // Keep local items as-is (they reflect the user's intent: edits + deletes within local set),
      // and re-add any cloud items whose id is NOT in local (they're from another device).
      const extras = cloudArr.filter(it => {
        if (!it || typeof it !== "object" || !("id" in it)) return false;
        return !localIds.has(String((it as any).id));
      });
      toWrite = [...localArr, ...extras];
    } catch (e) {
      console.warn(`[cloud] merge-before-write failed for ${key}`, e);
    }
  }
  await supabase.from("user_data").upsert(
    { user_id: userId, key, value: toWrite as any, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" }
  );
}

export function isPersonalKey(key: string): boolean {
  return PERSONAL_KEYS.includes(key);
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
