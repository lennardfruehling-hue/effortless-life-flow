import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
export default function OAuthConsent() {
  const [params] = useSearchParams();
  const id = params.get("authorization_id") ?? "";
  const { user, signOut } = useAuth();
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!id) throw new Error("Missing connection request. Start again from Claude.");
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          window.location.assign("/auth?next=" + encodeURIComponent(window.location.pathname + window.location.search));
          return;
        }
        const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
        if (!active) return;
        if (error) throw error;
        const d = data as any;
        if ((d?.redirect_url ?? d?.redirect_to) && !d?.client) { window.location.assign(d.redirect_url ?? d.redirect_to); return; }
        setDetails(d);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Could not load connection request."); }
    })();
    return () => { active = false; };
  }, [id]);
  async function decide(approve: boolean) {
    setBusy(true); setError("");
    try {
      const { data, error } = approve ? await supabase.auth.oauth.approveAuthorization(id) : await supabase.auth.oauth.denyAuthorization(id);
      if (error) throw error;
      const d = data as any;
      const redirect = d?.redirect_url ?? d?.redirect_to;
      if (!redirect) throw new Error("No return address received. Try again.");
      window.location.assign(redirect);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your decision."); setBusy(false); }
  }
  return <main className="min-h-screen bg-background flex items-center justify-center p-6">
    <section className="w-full max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Connect {details?.client?.name ?? "Claude"} to Serpent</h1>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!details ? <p className="text-muted-foreground">{error ? "Start again from your assistant to request access." : "Loading connection request…"}</p> : <>
        <p className="text-sm">{user?.email}</p>
        <p>This lets {details.client?.name ?? "Claude"} read and update your tasks, projects, habits, reminders, calendar and job hunt.</p>
        <p className="text-sm text-muted-foreground break-all">{details.redirect_uri ?? details.client?.redirect_uri}</p>
        <p className="text-sm">Your existing account permissions still apply. Changes require confirmation.</p>
        {String(details.scope ?? "").split(" ").filter(Boolean).map(scope => <p key={scope} className="text-sm">{scope === "email" ? "Share your email address" : scope === "profile" ? "Share your basic profile" : scope === "openid" ? "Confirm your identity" : `Additional permission: ${scope}`}</p>)}
        <div className="flex gap-3"><Button disabled={busy} onClick={() => void decide(true)}>Approve connection</Button><Button disabled={busy} variant="outline" onClick={() => void decide(false)}>Cancel connection</Button></div>
        <Button variant="ghost" disabled={busy} onClick={() => void signOut().then(() => window.location.reload())}>Switch account</Button>
      </>}
    </section>
  </main>;
}