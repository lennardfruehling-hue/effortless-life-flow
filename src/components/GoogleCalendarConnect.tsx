import { useEffect, useState } from "react";
import { CalendarEvent } from "@/lib/types";
import { Calendar as CalIcon, Check, X, RefreshCw } from "lucide-react";
import { v4 as uuid } from "uuid";

declare global {
  interface Window {
    google?: any;
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/calendar";
const CID_KEY = "serpent-gcal-client-id";
const TOKEN_KEY = "serpent-gcal-token";

interface Props {
  events: CalendarEvent[];
  onSave: (events: CalendarEvent[]) => void;
}

function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

export default function GoogleCalendarConnect({ events, onSave }: Props) {
  const [showSetup, setShowSetup] = useState(false);
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem(CID_KEY) || "");
  const [token, setToken] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.expiresAt && parsed.expiresAt > Date.now()) return parsed.access_token;
      return null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadGIS().catch((e) => setError(e.message)); }, []);

  const connect = async () => {
    setError(null);
    if (!clientId.trim()) {
      setShowSetup(true);
      return;
    }
    try {
      await loadGIS();
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: SCOPE,
        callback: (resp: any) => {
          if (resp.error) {
            setError(resp.error_description || resp.error);
            return;
          }
          const expiresAt = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3600 * 1000);
          localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token: resp.access_token, expiresAt }));
          setToken(resp.access_token);
          syncFromGoogle(resp.access_token);
        },
      });
      tokenClient.requestAccessToken({ prompt: token ? "" : "consent" });
    } catch (e: any) {
      setError(e.message || "Failed to start OAuth");
    }
  };

  const disconnect = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  const syncFromGoogle = async (accessToken?: string) => {
    const tk = accessToken || token;
    if (!tk) return;
    setLoading(true);
    setError(null);
    try {
      const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=500`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
      if (!r.ok) {
        if (r.status === 401) {
          disconnect();
          throw new Error("Session expired — reconnect Google");
        }
        throw new Error(`Google API error ${r.status}`);
      }
      const data = await r.json();
      const items: any[] = data.items || [];
      const imported: CalendarEvent[] = items
        .filter((e) => e.start && (e.start.dateTime || e.start.date))
        .map((e) => {
          const allDay = !!e.start.date;
          const start = allDay ? `${e.start.date}T00:00` : e.start.dateTime.slice(0, 16);
          const end = allDay
            ? `${(e.end?.date || e.start.date)}T00:00`
            : (e.end?.dateTime || e.start.dateTime).slice(0, 16);
          return {
            id: uuid(),
            title: e.summary || "(no title)",
            description: e.description || undefined,
            start,
            end,
            allDay,
            source: "google" as const,
            googleId: e.id,
          };
        });
      const existingIds = new Set(events.filter((e) => e.googleId).map((e) => e.googleId));
      const fresh = imported.filter((e) => !existingIds.has(e.googleId));
      // Replace existing google events with fresh set (full re-sync of google source)
      const nonGoogle = events.filter((e) => e.source !== "google");
      onSave([...nonGoogle, ...imported]);
    } catch (e: any) {
      setError(e.message || "Sync failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {token ? (
        <>
          <button
            onClick={() => syncFromGoogle()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Re-sync from Google Calendar"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Sync Google
          </button>
          <button
            onClick={disconnect}
            className="flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-md text-muted-foreground hover:text-destructive transition-colors"
          >
            <X size={14} /> Disconnect
          </button>
        </>
      ) : (
        <button
          onClick={connect}
          className="flex items-center gap-1.5 text-xs px-3 py-2 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
          title="Connect your Google Calendar"
        >
          <CalIcon size={14} /> Connect Google
        </button>
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded shadow-lg text-xs z-50 max-w-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={12} className="inline" /></button>
        </div>
      )}

      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Connect Google Calendar</h3>
              <button onClick={() => setShowSetup(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste your Google OAuth <strong>Client ID</strong> (Web application).
              Create one at <a className="text-primary underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console</a>,
              enable the <strong>Google Calendar API</strong>, and add <code className="bg-secondary px-1 rounded">{window.location.origin}</code> to the Authorized JavaScript origins.
            </p>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxx.apps.googleusercontent.com"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
            <button
              onClick={() => {
                if (!clientId.trim()) return;
                localStorage.setItem(CID_KEY, clientId.trim());
                setShowSetup(false);
                setTimeout(connect, 100);
              }}
              disabled={!clientId.trim()}
              className="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity flex items-center justify-center gap-2"
            >
              <Check size={14} /> Save & Connect
            </button>
          </div>
        </div>
      )}
    </>
  );
}
