import { supabase } from "@/integrations/supabase/client";
import { CLOUD_KEYS, cloudGet, cloudGetShared, cloudSet, isPersonalKey } from "./cloudStore";

const KEYS = Object.values(CLOUD_KEYS);
const debounceTimers: Record<string, number> = {};
let patched = false;
let activeUserId: string | null = null;

function pushDebounced(userId: string, key: string, raw: string | null) {
  if (debounceTimers[key]) window.clearTimeout(debounceTimers[key]);
  debounceTimers[key] = window.setTimeout(() => {
    let value: any = null;
    if (raw !== null) {
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
    }
    cloudSet(userId, key, value);
  }, 500) as unknown as number;
}

function patchLocalStorage() {
  if (patched) return;
  patched = true;
  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = (k: string, v: string) => {
    origSet(k, v);
    if (activeUserId && KEYS.includes(k as any)) pushDebounced(activeUserId, k, v);
  };
  localStorage.removeItem = (k: string) => {
    origRemove(k);
    if (activeUserId && KEYS.includes(k as any)) pushDebounced(activeUserId, k, null);
  };
}

async function refreshKey(userId: string, key: string) {
  const cloudVal = isPersonalKey(key)
    ? await cloudGet<unknown>(userId, key, null as any)
    : await cloudGetShared<unknown>(key, null as any);
  const prev = activeUserId;
  activeUserId = null;
  if (cloudVal === null || cloudVal === undefined) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(cloudVal));
  }
  activeUserId = prev;
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

/** Pull all known keys from cloud into localStorage, merging across household members. */
export async function hydrateFromCloud(userId: string) {
  patchLocalStorage();
  activeUserId = null; // pause sync during hydration
  for (const key of KEYS) {
    const cloudVal = isPersonalKey(key)
      ? await cloudGet<unknown>(userId, key, null as any)
      : await cloudGetShared<unknown>(key, null as any);
    if (cloudVal !== null && cloudVal !== undefined) {
      localStorage.setItem(key, JSON.stringify(cloudVal));
    } else {
      const local = localStorage.getItem(key);
      if (local) {
        try {
          await cloudSet(userId, key, JSON.parse(local));
        } catch {}
      }
    }
  }
  activeUserId = userId;

  // Realtime updates from any household member (RLS restricts visibility to the household).
  supabase
    .channel(`user_data_${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_data" },
      (payload: any) => {
        const row = payload.new ?? payload.old;
        if (!row) return;
        const key = row.key as string;
        if (!KEYS.includes(key as any)) return;
        if (isPersonalKey(key)) {
          if (row.user_id !== userId) return;
          const prev = activeUserId;
          activeUserId = null;
          if (payload.eventType === "DELETE") localStorage.removeItem(key);
          else localStorage.setItem(key, JSON.stringify(row.value));
          activeUserId = prev;
          window.dispatchEvent(new StorageEvent("storage", { key }));
        } else {
          void refreshKey(userId, key);
        }
      }
    )
    .subscribe();
}

export function clearCloudSync() {
  activeUserId = null;
  for (const key of KEYS) localStorage.removeItem(key);
}
