import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { oauthReturnPath } from "@/lib/oauth-return-path";

export default function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  const next = oauthReturnPath(new URLSearchParams(window.location.search).get("next") ?? sessionStorage.getItem("serpent-auth-next"));

  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      if (inviteToken) {
        const { data, error } = await supabase.rpc("accept_invite_token", { _token: inviteToken });
        if (error) toast.error(error.message);
        else if ((data as any)?.ok) toast.success("Joined household!");
        else toast.error("Invite invalid or expired");
      }
      sessionStorage.removeItem("serpent-auth-next");
      navigate(next, { replace: true });
    })();
  }, [user, loading, navigate, inviteToken, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: new URL(next, window.location.origin).href },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(next, { replace: true });
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    sessionStorage.setItem("serpent-auth-next", next);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: new URL(`/auth?next=${encodeURIComponent(next)}`, window.location.origin).href });
    if (result.error) toast.error("Google sign-in failed");
    if (!result.redirected) setBusy(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-center">{mode === "signin" ? "Sign in" : "Create account"}</h1>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Sign up"}
          </Button>
        </form>
        <Button type="button" variant="outline" className="w-full" onClick={google} disabled={busy}>
          Continue with Google
        </Button>
        <button
          type="button"
          className="w-full text-sm text-muted-foreground hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </Card>
    </main>
  );
}
