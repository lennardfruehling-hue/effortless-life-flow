import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, Mail, Trash2, Copy, Loader2, Check } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Household { id: string; name: string }
interface Member { user_id: string; role: "owner" | "member"; joined_at: string }
interface Invite { id: string; email: string; token: string; created_at: string; expires_at: string; accepted: boolean }

export default function HouseholdSettings({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [hh, mm, ii] = await Promise.all([
      supabase.from("households").select("*").maybeSingle(),
      supabase.from("household_members").select("*").order("joined_at"),
      supabase.from("household_invites").select("*").eq("accepted", false).order("created_at", { ascending: false }),
    ]);
    if (hh.data) setHousehold(hh.data as Household);
    if (mm.data) setMembers(mm.data as Member[]);
    if (ii.data) setInvites(ii.data as Invite[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sendInvite = async () => {
    if (!email.trim() || !household || !user) return;
    setBusy(true);
    const { data, error } = await supabase.from("household_invites").insert({
      household_id: household.id,
      email: email.trim().toLowerCase(),
      invited_by: user.id,
    }).select().single();
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't create invite", description: error.message, variant: "destructive" });
      return;
    }
    setEmail("");
    setInvites(prev => [data as Invite, ...prev]);
    toast({ title: "Invite created", description: `Share the link with ${(data as Invite).email}` });
  };

  const revokeInvite = async (id: string) => {
    await supabase.from("household_invites").delete().eq("id", id);
    setInvites(prev => prev.filter(i => i.id !== id));
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/auth?invite=${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  };

  const renameHousehold = async (name: string) => {
    if (!household) return;
    setHousehold({ ...household, name });
    await supabase.from("households").update({ name }).eq("id", household.id);
  };

  const isOwner = members.find(m => m.user_id === user?.id)?.role === "owner";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users size={18} className="text-primary" /> Household
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">Close</button>
        </div>

        {loading || !household ? (
          <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="p-5 space-y-6">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Household name</label>
              <input
                value={household.name}
                onChange={(e) => renameHousehold(e.target.value)}
                disabled={!isOwner}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Everyone in your household sees the same tasks, projects, calendar, lists, reminders and notes.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Members ({members.length})</h3>
              <div className="space-y-1.5">
                {members.map(m => (
                  <div key={m.user_id} className="flex items-center justify-between bg-secondary/50 border border-border/50 rounded px-3 py-2 text-sm">
                    <span className="text-foreground font-mono text-xs truncate">
                      {m.user_id === user?.id ? "You" : m.user_id.slice(0, 8) + "…"}
                    </span>
                    <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded ${m.role === "owner" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Mail size={14} className="text-primary" /> Invite someone
              </h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="spouse@example.com"
                  className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={sendInvite}
                  disabled={busy || !email.trim()}
                  className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-30"
                >
                  Invite
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                When they sign up with this email, they'll be added to your household automatically. You can also share the invite link below.
              </p>
            </div>

            {invites.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Pending invites</h3>
                <div className="space-y-1.5">
                  {invites.map(inv => (
                    <div key={inv.id} className="flex items-center gap-2 bg-secondary/50 border border-border/50 rounded px-3 py-2 text-sm">
                      <span className="flex-1 truncate text-foreground">{inv.email}</span>
                      <button
                        onClick={() => copyLink(inv.token)}
                        className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs"
                        title="Copy invite link"
                      >
                        {copied === inv.token ? <Check size={12} /> : <Copy size={12} />}
                        {copied === inv.token ? "Copied" : "Link"}
                      </button>
                      <button
                        onClick={() => revokeInvite(inv.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Revoke"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
