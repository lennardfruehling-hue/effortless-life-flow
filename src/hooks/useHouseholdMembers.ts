import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface MemberProfile {
  user_id: string;
  display_name: string | null;
  color: string;
}

export function useHouseholdMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) { setMembers([]); setLoading(false); return; }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, color");
    setMembers((data as MemberProfile[]) || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { reload(); }, [reload]);

  // Listen for explicit refresh events
  useEffect(() => {
    const h = () => reload();
    window.addEventListener("household-updated", h);
    return () => window.removeEventListener("household-updated", h);
  }, [reload]);

  const byId = (id?: string | null) => members.find(m => m.user_id === id);
  return { members, byId, loading, reload };
}
