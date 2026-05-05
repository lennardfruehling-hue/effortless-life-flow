import { useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { cloudGet, cloudSet } from "@/lib/cloudStore";

/**
 * Cloud-synced state. Loads from Supabase on mount/user change, debounced save on change.
 */
export function useCloudState<T>(key: string, fallback: T): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const { user } = useAuth();
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  const skipSave = useRef(true);
  const timer = useRef<number | null>(null);

  // Load when user changes
  useEffect(() => {
    let cancel = false;
    setLoaded(false);
    skipSave.current = true;
    if (!user) {
      setValue(fallback);
      setLoaded(true);
      return;
    }
    cloudGet<T>(user.id, key, fallback).then((v) => {
      if (cancel) return;
      setValue(v);
      setLoaded(true);
    });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key]);

  // Debounced save
  useEffect(() => {
    if (!user || !loaded) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      cloudSet(user.id, key, value);
    }, 400);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, user?.id, loaded]);

  return [value, setValue, loaded];
}
