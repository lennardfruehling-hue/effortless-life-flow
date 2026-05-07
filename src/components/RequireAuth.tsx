import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { hydrateFromCloud, clearCloudSync } from "@/lib/syncBridge";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (!user) {
      clearCloudSync();
      setHydrated(false);
      return;
    }
    setHydrated(false);
    // Hard backstop: never block the UI more than 10s on hydration.
    const backstop = window.setTimeout(() => {
      if (!cancel) {
        console.warn("[sync] hydration backstop fired — releasing UI");
        setHydrated(true);
      }
    }, 10000);
    hydrateFromCloud(user.id).finally(() => {
      window.clearTimeout(backstop);
      if (!cancel) setHydrated(true);
    });
    return () => {
      cancel = true;
      window.clearTimeout(backstop);
    };
  }, [user?.id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!hydrated) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Syncing your data…</div>;
  return <>{children}</>;
}
