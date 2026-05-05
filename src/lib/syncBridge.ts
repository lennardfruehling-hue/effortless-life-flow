import { supabase } from "@/integrations/supabase/client";
import { CLOUD_KEYS, cloudGet, cloudSet } from "./cloudStore";

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

/** Pull all known keys from cloud into localStorage. If cloud is empty for a key, push existing local. */
export async function hydrateFromCloud(userId: string) {
  patchLocalStorage();
  activeUserId = null; // pause sync during hydration
  for (const key of KEYS) {
    const cloudVal = await cloudGet<unknown>(userId, key, null as any);
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

  // Realtime updates from other devices
  supabase
    .channel(`user_data_${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_data", filter: `user_id=eq.${userId}` },
      (payload: any) => {
        const row = payload.new ?? payload.old;
        if (!row) return;
        const key = row.key as string;
        if (!KEYS.includes(key as any)) return;
        // suppress sync-back loop
        const prev = activeUserId;
        activeUserId = null;
        if (payload.eventType === "DELETE") localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(row.value));
        activeUserId = prev;
        window.dispatchEvent(new StorageEvent("storage", { key }));
      }
    )
    .subscribe();
}

export function clearCloudSync() {
  activeUserId = null;
  for (const key of KEYS) localStorage.removeItem(key);
}
