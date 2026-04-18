import { useEffect, useState } from "react";
import { ExternalLink, Mail, Loader2, RefreshCw, AlertCircle, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  unread: boolean;
}

export default function GmailView() {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    setNotConnected(false);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-list");
      if (error) throw error;
      if (data?.notConnected) {
        setNotConnected(true);
        setMessages([]);
      } else if (data?.messages) {
        setMessages(data.messages);
      } else if (data?.error) {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load Gmail");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openGmail = () => window.open("https://mail.google.com/mail/u/0/#inbox", "_blank", "noopener,noreferrer");

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-border bg-card/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={20} className="text-primary" />
          <h2 className="text-lg font-bold text-foreground">Gmail</h2>
          <span className="text-xs text-muted-foreground ml-2">
            {notConnected ? "Not connected" : `${messages.length} recent messages`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1.5 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={openGmail}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:opacity-90"
          >
            <ExternalLink size={12} /> Open Gmail
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading Gmail…</p>
          </div>
        )}

        {!loading && notConnected && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 max-w-md mx-auto">
            <Inbox size={48} className="text-primary/30 mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">Gmail can't be embedded</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Google blocks Gmail from being shown inside another app for security
              (X-Frame-Options). Click below to open Gmail in a real browser tab —
              you'll stay signed in and can come right back.
            </p>
            <div className="flex gap-2">
              <button
                onClick={openGmail}
                className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground rounded px-4 py-2 hover:opacity-90"
              >
                <ExternalLink size={14} /> Open Gmail in new tab
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-4">
              Native in-app Gmail (read inbox here) isn't available — Gmail isn't a supported Lovable connector yet.
            </p>
          </div>
        )}

        {!loading && error && !notConnected && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 max-w-md mx-auto">
            <AlertCircle size={36} className="text-destructive mb-3" />
            <p className="text-sm text-destructive">{error}</p>
            <button onClick={load} className="mt-4 text-xs text-primary hover:underline">Try again</button>
          </div>
        )}

        {!loading && !notConnected && !error && messages.length > 0 && (
          <ul className="divide-y divide-border">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`px-6 py-3 hover:bg-secondary/40 transition-colors cursor-pointer ${m.unread ? "bg-primary/5" : ""}`}
                onClick={() => window.open(`https://mail.google.com/mail/u/0/#inbox/${m.threadId}`, "_blank", "noopener,noreferrer")}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {m.unread && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                      <span className={`text-sm truncate ${m.unread ? "font-semibold text-foreground" : "text-foreground"}`}>
                        {m.from}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${m.unread ? "font-medium" : ""} text-foreground`}>{m.subject || "(no subject)"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{m.snippet}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0">
                    {new Date(m.date).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && !notConnected && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Inbox size={36} className="text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Inbox is empty.</p>
          </div>
        )}
      </div>
    </div>
  );
}
