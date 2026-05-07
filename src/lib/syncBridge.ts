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
    try { origSet(k, v); } catch (e) { console.warn(`[sync] setItem failed for ${k}`, e); }
    if (activeUserId && KEYS.includes(k as any)) pushDebounced(activeUserId, k, v);
  };
  localStorage.removeItem = (k: string) => {
    origRemove(k);
    if (activeUserId && KEYS.includes(k as any)) pushDebounced(activeUserId, k, null);
  };
}

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`[sync] localStorage quota exceeded for ${key} (${value.length} chars). Skipping local cache; data still lives in cloud.`, e);
    try { localStorage.removeItem(key); } catch {}
    return false;
  }
}

async function refreshKey(userId: string, key: string) {
  const cloudVal = isPersonalKey(key)
    ? await cloudGet<unknown>(userId, key, null as any)
    : await cloudGetShared<unknown>(key, null as any);
  const prev = activeUserId;
  activeUserId = null;
  if (cloudVal === null || cloudVal === undefined) {
    try { localStorage.removeItem(key); } catch {}
  } else {
    safeSetItem(key, JSON.stringify(cloudVal));
  }
  activeUserId = prev;
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

/** Pull all known keys from cloud into localStorage in parallel, with per-key timeout so no single key can stall the loading gate. */
export async function hydrateFromCloud(userId: string) {
  patchLocalStorage();
  activeUserId = null; // pause sync during hydration

  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        console.warn(`[sync] hydrate timeout after ${ms}ms`);
        resolve(null);
      }, ms);
      p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); console.warn("[sync] hydrate err", e); resolve(null); });
    });

  await Promise.all(KEYS.map(async (key) => {
    try {
      const cloudVal = await withTimeout(
        isPersonalKey(key)
          ? cloudGet<unknown>(userId, key, null as any)
          : cloudGetShared<unknown>(key, null as any),
        8000
      );
      if (cloudVal !== null && cloudVal !== undefined) {
        safeSetItem(key, JSON.stringify(cloudVal));
      } else {
        const local = localStorage.getItem(key);
        if (local) {
          try { await cloudSet(userId, key, JSON.parse(local)); } catch {}
        }
      }
    } catch (err) {
      console.warn(`[sync] failed to hydrate ${key}`, err);
    }
  }));

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
