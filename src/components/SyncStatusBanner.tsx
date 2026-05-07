import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle } from "lucide-react";

/**
 * Shows a sticky warning banner whenever the user is NOT signed in,
 * so they know that any tasks/notes/lists they create live only in
 * this browser's localStorage and won't sync to the cloud.
 */
export default function SyncStatusBanner() {
  const { user, loading } = useAuth() as any;
  if (loading || user) return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-destructive/95 text-destructive-foreground border-b border-destructive/60 backdrop-blur">
      <div className="flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium">
        <AlertTriangle size={16} className="shrink-0" />
        <span>
          You're not signed in — changes stay in this browser only and won't sync to your account.
        </span>
        <a href="/auth" className="ml-auto underline underline-offset-2 hover:opacity-80">
          Sign in
        </a>
      </div>
    </div>
  );
}
