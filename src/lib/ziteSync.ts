import { supabase } from "@/integrations/supabase/client";
import type { FinanceState } from "@/components/FinanceSummaryCard";

export const DEFAULT_ZITE_URL = "https://45qzpzd743.zite.so";
const LAST_TRY_KEY = "serpent-zite-last-try";

export type ZiteFinance = FinanceState & {
  source?: "zite";
  syncedAt?: string;
  healthScore?: number | null;
  healthLabel?: string | null;
  ziteWarnings?: { id: string; severity: string; title: string; detail: string }[];
};

/** Pull the latest Zite balances and store them as the finance state. */
export async function syncZite(url = DEFAULT_ZITE_URL): Promise<ZiteFinance> {
  const { data, error } = await supabase.functions.invoke("zite-sync", { body: { url } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  const finance = data?.results?.[0]?.finance as ZiteFinance | undefined;
  if (!finance) throw new Error("No data returned from Zite");
  return finance;
}

/** Sync at most once every `hours` per browser (used for the daily auto-refresh). */
export async function syncZiteIfStale(syncedAt?: string, hours = 12): Promise<ZiteFinance | null> {
  const now = Date.now();
  const lastTry = Number(localStorage.getItem(LAST_TRY_KEY) || 0);
  if (now - lastTry < 60 * 60 * 1000) return null;
  if (syncedAt && now - new Date(syncedAt).getTime() < hours * 60 * 60 * 1000) return null;
  localStorage.setItem(LAST_TRY_KEY, String(now));
  try {
    return await syncZite();
  } catch {
    return null;
  }
}
