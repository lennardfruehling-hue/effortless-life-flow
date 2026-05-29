import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Task } from "@/lib/types";

export interface AssignmentNotification {
  id: string;          // stable: "task-<id>" or "note-<id>"
  kind: "task" | "note";
  label: string;       // title
  detail?: string;     // sub-line
  assignedBy?: string; // creator id (display purposes)
  ts: number;          // timestamp for ordering
}

interface NoteRow {
  id: string;
  title: string | null;
  created_by: string | null;
  assignee_ids: any;
  updated_at: string;
}

const DISMISS_KEY = "serpent-assignment-dismissed-v1";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveDismissed(s: Set<string>) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(s)));
  } catch {}
}

/**
 * Surfaces notifications when tasks or research notes are assigned to the current
 * user by *someone else*. Each notification can be dismissed; dismissed ids are
 * persisted locally so they don't reappear.
 */
export function useAssignmentNotifications(tasks: Task[]) {
  const { user } = useAuth();
  const myId = user?.id ?? null;

  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [noteRows, setNoteRows] = useState<NoteRow[]>([]);

  // Load + subscribe to notes assigned to me
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("research_notes")
        .select("id,title,created_by,assignee_ids,updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error || cancelled) return;
      setNoteRows((data ?? []) as NoteRow[]);
    };
    load();

    const channel = supabase
      .channel("assign-notes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "research_notes" },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [myId]);

  const notifications = useMemo<AssignmentNotification[]>(() => {
    if (!myId) return [];
    const out: AssignmentNotification[] = [];

    // Tasks assigned to me by someone else
    for (const t of tasks) {
      if (t.completed) continue;
      const ids = t.assigneeIds && t.assigneeIds.length > 0
        ? t.assigneeIds
        : (t.assigneeId ? [t.assigneeId] : []);
      if (!ids.includes(myId)) continue;
      if (!t.createdBy || t.createdBy === myId) continue;
      const id = `task-${t.id}`;
      if (dismissed.has(id)) continue;
      out.push({
        id,
        kind: "task",
        label: t.title,
        detail: t.dueDate ? `Due ${t.dueDate}${t.dueTime ? " " + t.dueTime : ""}` : "Task assigned to you",
        assignedBy: t.createdBy,
        ts: Date.parse((t as any).updatedAt ?? (t as any).createdAt ?? "") || Date.now(),
      });
    }

    // Notes assigned to me by someone else
    for (const n of noteRows) {
      const ids: string[] = Array.isArray(n.assignee_ids) ? n.assignee_ids : [];
      if (!ids.includes(myId)) continue;
      if (!n.created_by || n.created_by === myId) continue;
      const id = `note-${n.id}`;
      if (dismissed.has(id)) continue;
      out.push({
        id,
        kind: "note",
        label: n.title || "Untitled note",
        detail: "Note shared with you",
        assignedBy: n.created_by ?? undefined,
        ts: Date.parse(n.updated_at) || Date.now(),
      });
    }

    return out.sort((a, b) => b.ts - a.ts);
  }, [tasks, noteRows, myId, dismissed]);

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  };

  const dismissAll = () => {
    setDismissed((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      saveDismissed(next);
      return next;
    });
  };

  return { notifications, dismiss, dismissAll };
}
