import { useEffect, useState } from "react";
import { ExternalLink, NotebookPen, Loader2, RefreshCw, AlertCircle, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OneNotePage {
  id: string;
  title: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  links?: { oneNoteWebUrl?: { href: string } };
}

export default function OneNoteView() {
  const [pages, setPages] = useState<OneNotePage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    setNotConnected(false);
    try {
      const { data, error } = await supabase.functions.invoke("onenote-list");
      if (error) throw error;
      if (data?.notConnected) {
        setNotConnected(true);
        setPages([]);
      } else if (data?.pages) {
        setPages(data.pages);
      } else if (data?.error) {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load OneNote");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openOneNote = () => window.open("https://www.onenote.com/notebooks", "_blank", "noopener,noreferrer");

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-border bg-card/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <NotebookPen size={20} className="text-primary" />
          <h2 className="text-lg font-bold text-foreground">OneNote</h2>
          <span className="text-xs text-muted-foreground ml-2">
            {notConnected ? "Not connected" : `${pages.length} recent pages`}
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
            onClick={openOneNote}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:opacity-90"
          >
            <ExternalLink size={12} /> Open OneNote
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading OneNote…</p>
          </div>
        )}

        {!loading && notConnected && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 max-w-md mx-auto">
            <BookOpen size={48} className="text-primary/30 mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">Connect your OneNote account</h3>
            <p className="text-sm text-muted-foreground mb-5">
              OneNote can't be embedded as an iframe (Microsoft blocks it for security).
              Link your Microsoft account to read pages inside this app, or open OneNote in a new browser tab.
            </p>
            <div className="flex gap-2">
              <button
                onClick={openOneNote}
                className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground rounded px-4 py-2 hover:opacity-90"
              >
                <ExternalLink size={14} /> Open OneNote in new tab
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-4">
              To enable the in-app notebook view, ask the AI assistant to "connect OneNote".
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

        {!loading && !notConnected && !error && pages.length > 0 && (
          <ul className="divide-y divide-border">
            {pages.map((p) => (
              <li
                key={p.id}
                className="px-6 py-3 hover:bg-secondary/40 transition-colors cursor-pointer"
                onClick={() => p.links?.oneNoteWebUrl?.href && window.open(p.links.oneNoteWebUrl.href, "_blank", "noopener,noreferrer")}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{p.title || "Untitled"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Updated {new Date(p.lastModifiedDateTime).toLocaleString()}
                    </p>
                  </div>
                  <ExternalLink size={12} className="text-muted-foreground flex-shrink-0" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && !notConnected && !error && pages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <BookOpen size={36} className="text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No pages found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
