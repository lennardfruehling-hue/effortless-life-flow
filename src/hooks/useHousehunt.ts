import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { HOUSEHUNT_KEY, HouseListing, HouseStage, patchHouseListings } from "@/lib/househunt";
export function useHousehunt() {
  const { user } = useAuth();
  const [rows, setRows] = useState<HouseListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const read = useCallback(async () => {
    if (!user) return;
    const request = ++generation.current;
    try {
      const { data, error } = await supabase.from("user_data").select("value").eq("user_id", user.id).eq("key", HOUSEHUNT_KEY).maybeSingle();
      if (error) throw error;
      if (request === generation.current) { setRows(Array.isArray(data?.value) ? data.value as unknown as HouseListing[] : []); setError(""); }
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : "Could not load Househunt."); }
    finally { if (request === generation.current) setLoading(false); }
  }, [user?.id]);
  useEffect(() => {
    setRows([]); setLoading(true); void read();
    if (!user) return;
    const refresh = () => { if (document.visibilityState === "visible") void read(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const channel = supabase.channel(`househunt-${user.id}-${Date.now()}`).on("postgres_changes", { event: "*", schema: "public", table: "user_data", filter: `user_id=eq.${user.id}` }, payload => {
      const row = payload.new as { key?: string };
      if (row.key === HOUSEHUNT_KEY) void read();
    }).subscribe();
    return () => { generation.current++; void supabase.removeChannel(channel); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [read, user?.id]);
  const patch = async (id: string, fields: { stage?: HouseStage; notes?: string; nextAction?: string }) => {
    if (!user || saving) throw new Error("Sign in and wait for the current save.");
    setSaving(true);
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await supabase.from("user_data").select("value,updated_at").eq("user_id", user.id).eq("key", HOUSEHUNT_KEY).maybeSingle();
        if (error) throw error;
        if (!data || !Array.isArray(data.value)) throw new Error("This listing is no longer available.");
        const latest = data.value as unknown as HouseListing[];
        const next = patchHouseListings(latest, id, fields);
        const result = await supabase.from("user_data").update({ value: next as any, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("key", HOUSEHUNT_KEY).eq("updated_at", data.updated_at).select("key");
        if (result.error) throw result.error;
        if (!result.data?.length) continue;
        await read(); return;
      }
      throw new Error("Listings changed during your save. Please try again.");
    } finally { setSaving(false); }
  };
  return { rows, loading, saving, error, refresh: read, patch };
}