import { supabase } from "@/integrations/supabase/client";
import { CLOUD_KEYS, cloudGet, cloudGetShared, cloudSet, isPersonalKey } from "./cloudStore";

const KEYS = Object.values(CLOUD_KEYS);
const debounceTimers: Record<string, number> = {};
const suppressUntil: Record<string, number> = {};
const lastPushedHash: Record<string, string> = {};
let patched = false;
let activeUserId: string | null = null;
/** Keys that were modified locally before sync was active — flush them once a user is set. */
const pendingKeys = new Set<string>();

// Mark a key as "just received from cloud" so we don't immediately echo it back.
function suppressPush(key: string, ms = 3000) {
  suppressUntil[key] = Date.now() + ms;
}

function pushDebounced(userId: string, key: string, raw: string | null) {
  if (debounceTimers[key]) window.clearTimeout(debounceTimers[key]);
  debounceTimers[key] = window.setTimeout(async () => {
    // Drop pushes that are echoes of a value we just hydrated from cloud.
    if (Date.now() < (suppressUntil[key] ?? 0)) {
      const hash = raw ?? "null";
      if (lastPushedHash[key] === hash) {
        delete debounceTimers[key];
        return;
      }
    }
    let value: any = null;
    if (raw !== null) {
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
    }
    lastPushedHash[key] = raw ?? "null";
    try {
      await cloudSet(userId, key, value);
    } finally {
      delete debounceTimers[key];
    }
  }, 500) as unknown as number;
}

function patchLocalStorage() {
  if (patched) return;
  patched = true;
  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = (k: string, v: string) => {
    try { origSet(k, v); } catch (e) { console.warn(`[sync] setItem failed for ${k}`, e); }
    if (!KEYS.includes(k as any)) return;
    if (activeUserId) {
      pushDebounced(activeUserId, k, v);
    } else {
      // No active user yet — remember this key so we can flush after hydrate.
      pendingKeys.add(k);
    }
  };
  localStorage.removeItem = (k: string) => {
    origRemove(k);
    if (!KEYS.includes(k as any)) return;
    if (activeUserId) {
      pushDebounced(activeUserId, k, null);
    } else {
      pendingKeys.add(k);
    }
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

/** Merge two arrays of objects by `id`, keeping the union (no destruction). */
function mergeArraysById(a: any[], b: any[]): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  for (const item of [...a, ...b]) {
    if (!item || typeof item !== "object") { out.push(item); continue; }
    const id = "id" in item ? String((item as any).id) : JSON.stringify(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

async function refreshKey(userId: string, key: string) {
  // If we have a pending local push for this key, skip the refresh.
  // The realtime event is likely an echo of an earlier write and would otherwise
  // clobber the in-progress local edits before they reach the cloud.
  if (debounceTimers[key]) {
    return;
  }
  const cloudVal = isPersonalKey(key)
    ? await cloudGet<unknown>(userId, key, null as any)
    : await cloudGetShared<unknown>(key, null as any);
  // Re-check after the await: a local write may have started during the network call.
  if (debounceTimers[key]) return;
  const prev = activeUserId;
  activeUserId = null;
  const serialized = cloudVal === null || cloudVal === undefined ? null : JSON.stringify(cloudVal);
  // No-op if cloud value matches what we already have — avoids noisy re-renders.
  const current = localStorage.getItem(key);
  if (current === serialized) {
    activeUserId = prev;
    return;
  }
  if (serialized === null) {
    try { localStorage.removeItem(key); } catch {}
  } else {
    safeSetItem(key, serialized);
  }
  // Mark this value as "just hydrated" so we don't immediately push it back.
  lastPushedHash[key] = serialized ?? "null";
  suppressPush(key);
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

  // Snapshot local BEFORE we touch anything so we can merge instead of overwrite.
  const localSnapshot: Record<string, string | null> = {};
  for (const key of KEYS) localSnapshot[key] = localStorage.getItem(key);

  // Track keys whose merged value differs from cloud, so we re-push after we
  // set activeUserId. Without this, local-only items added while signed out
  // (or while a session was expired) would be silently destroyed by hydrate.
  const needsPush: string[] = [];

  await Promise.all(KEYS.map(async (key) => {
    try {
      const cloudVal = await withTimeout(
        isPersonalKey(key)
          ? cloudGet<unknown>(userId, key, null as any)
          : cloudGetShared<unknown>(key, null as any),
        8000
      );

      const localRaw = localSnapshot[key];
      let localParsed: any = null;
      if (localRaw) {
        try { localParsed = JSON.parse(localRaw); } catch { localParsed = null; }
      }

      // PERSONAL keys: cloud is authoritative. Never merge in localStorage,
      // because it may belong to a previously signed-in user on this browser.
      if (isPersonalKey(key)) {
        const serialized = cloudVal === null || cloudVal === undefined ? null : JSON.stringify(cloudVal);
        if (serialized === null) {
          if (localRaw !== null) {
            try { localStorage.removeItem(key); } catch {}
          }
        } else if (serialized !== localRaw) {
          safeSetItem(key, serialized);
        }
        lastPushedHash[key] = serialized ?? "null";
        suppressPush(key);
        return;
      }

      // SHARED keys: merge cloud + local so local-only items survive.
      let merged: any = null;
      if (Array.isArray(cloudVal) || Array.isArray(localParsed)) {
        const a = Array.isArray(cloudVal) ? cloudVal as any[] : [];
        const b = Array.isArray(localParsed) ? localParsed as any[] : [];
        merged = mergeArraysById(a, b);
      } else if (cloudVal !== null && cloudVal !== undefined) {
        merged = cloudVal;
      } else if (localParsed !== null && localParsed !== undefined) {
        merged = localParsed;
      }

      if (merged === null || merged === undefined) return;

      const serialized = JSON.stringify(merged);
      if (serialized !== localRaw) {
        safeSetItem(key, serialized);
      }
      const cloudSerialized = cloudVal === null || cloudVal === undefined ? null : JSON.stringify(cloudVal);
      if (cloudSerialized !== serialized) {
        needsPush.push(key);
        lastPushedHash[key] = "";
      } else {
        lastPushedHash[key] = serialized;
        suppressPush(key);
      }
    } catch (err) {
      console.warn(`[sync] failed to hydrate ${key}`, err);
    }
  }));

  activeUserId = userId;

  // Push merged values for any key whose local copy contributed extras.
  for (const key of needsPush) {
    const raw = localStorage.getItem(key);
    pushDebounced(userId, key, raw);
  }

  // Flush any keys that were written before we had a user set.
  for (const key of Array.from(pendingKeys)) {
    if (needsPush.includes(key)) { pendingKeys.delete(key); continue; }
    const raw = localStorage.getItem(key);
    pushDebounced(userId, key, raw);
    pendingKeys.delete(key);
  }

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
  // IMPORTANT: do NOT wipe localStorage here. If the auth session expires
  // briefly (token refresh, tab focus, etc.) and this runs, we previously
  // destroyed all the user's local data — and on re-hydrate the (possibly
  // stale) cloud value would overwrite anything they'd added in the meantime.
  // Local data is harmless to leave behind; merge-on-hydrate handles it.
}

