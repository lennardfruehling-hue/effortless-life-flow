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
    hydrateFromCloud(user.id).then(() => {
      if (!cancel) setHydrated(true);
    });
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!hydrated) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Syncing your data…</div>;
  return <>{children}</>;
}
