import { supabase } from "@/integrations/supabase/client";
import { CLOUD_KEYS } from "./cloudKeys";
import { mergeCloudArrays } from "./cloudMerge";
export { CLOUD_KEYS } from "./cloudKeys";
const baselines = new Map<string, any>();
export function rememberCloudValue(userId: string, key: string, value: unknown) {
  baselines.set(`${userId}:${key}`, structuredClone(value));
}

/**
 * Read every household member's value for a key (per-user, no merging).
 * Returns rows of { user_id, value } so the caller can render owner-tagged variants.
 */
export async function cloudGetAllByKey<T>(key: string): Promise<{ user_id: string; value: T }[]> {
  const { data, error } = await supabase
    .from("user_data")
    .select("user_id, value")
    .eq("key", key);
  if (error || !data) return [];
  return data.map((r) => ({ user_id: r.user_id as string, value: r.value as T }));
}

// Per-user-only keys (do NOT merge across household — these are personal).
// Tasks are personal: each user has their own task list. Sharing happens by
// duplicating a task into another user's personal key when assigned.
// Daily schedule stays personal. Chat history stays personal.
// Weekly structure is shared so the household sees one structure.
const PERSONAL_KEYS: string[] = [
  CLOUD_KEYS.chatHistory,
  CLOUD_KEYS.dailySchedule,
  CLOUD_KEYS.tasks,
  CLOUD_KEYS.habits,
];

/** Write a value directly to another user's personal cloud row (used for task assignment duplication). */
export async function cloudSetForUser<T>(targetUserId: string, key: string, value: T): Promise<void> {
  await supabase.from("user_data").upsert(
    { user_id: targetUserId, key, value: value as any, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" }
  );
}

/** Append items into another user's personal array key, deduping by id. */
export async function cloudAppendForUser<T extends { id: string }>(
  targetUserId: string,
  key: string,
  items: T[]
): Promise<void> {
  const { data } = await supabase
    .from("user_data")
    .select("value")
    .eq("user_id", targetUserId)
    .eq("key", key)
    .maybeSingle();
  const existing = Array.isArray(data?.value) ? (data.value as unknown as T[]) : [];
  const seen = new Set(existing.map((i) => i.id));
  const merged = [...existing, ...items.filter((i) => !seen.has(i.id))];
  await cloudSetForUser(targetUserId, key, merged);
}

/** Get caller's row only (used for personal keys and writes). */
export async function cloudGet<T>(userId: string, key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from("user_data")
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  rememberCloudValue(userId, key, data.value);
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
  const baseline = baselines.get(`${userId}:${key}`);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.from("user_data").select("value,updated_at").eq("user_id", userId).eq("key", key).maybeSingle();
    if (error) throw error;
    const idArray = Array.isArray(value) && value.every(x => x && typeof x === "object" && "id" in x);
    const toWrite = idArray ? mergeCloudArrays(Array.isArray(data?.value) ? data.value as any[] : [], value as any[], Array.isArray(baseline) ? baseline : []) : value;
    const row = { user_id: userId, key, value: toWrite as any, updated_at: new Date().toISOString() };
    if (!data) {
      const result = await supabase.from("user_data").insert(row);
      if (result.error?.code === "23505") continue;
      if (result.error) throw result.error;
    } else {
      const result = await supabase.from("user_data").update(row).eq("user_id", userId).eq("key", key).eq("updated_at", data.updated_at).select("key");
      if (result.error) throw result.error;
      if (!result.data?.length) continue;
    }
    rememberCloudValue(userId, key, toWrite);
    return;
  }
  throw new Error("Data changed while saving. Please try again.");
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
