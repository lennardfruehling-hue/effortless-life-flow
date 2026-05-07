import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tag as TagIcon, Plus, X, Check } from "lucide-react";

export interface Tag {
  id: string;
  name: string;
  color: string;
}

const PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7",
  "#ec4899", "#64748b",
];

interface Props {
  /** "note" or "list" — picks which join table to use */
  kind: "note" | "list";
  /** Owner id (note_id or list_id) */
  ownerId: string;
}

export default function TagPicker({ kind, ownerId }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[5]);

  const joinTable = kind === "note" ? "note_tags" : "list_tags";
  const ownerCol = kind === "note" ? "note_id" : "list_id";

  const load = useCallback(async () => {
    const [{ data: tags }, { data: links }] = await Promise.all([
      supabase.from("tags").select("*").order("name"),
      supabase.from(joinTable).select("tag_id").eq(ownerCol, ownerId),
    ]);
    if (tags) setAllTags(tags as Tag[]);
    if (links) setSelected(links.map((l: any) => l.tag_id));
  }, [joinTable, ownerCol, ownerId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (tagId: string) => {
    if (selected.includes(tagId)) {
      setSelected(s => s.filter(x => x !== tagId));
      await supabase.from(joinTable).delete().eq(ownerCol, ownerId).eq("tag_id", tagId);
    } else {
      setSelected(s => [...s, tagId]);
      await supabase.from(joinTable).insert({ [ownerCol]: ownerId, tag_id: tagId } as any);
    }
  };

  const createTag = async () => {
    if (!newName.trim()) return;
    const { data } = await supabase.from("tags").insert({ name: newName.trim(), color: newColor }).select().single();
    if (data) {
      setAllTags(prev => [...prev, data as Tag]);
      await supabase.from(joinTable).insert({ [ownerCol]: ownerId, tag_id: (data as Tag).id } as any);
      setSelected(s => [...s, (data as Tag).id]);
      setNewName("");
    }
  };

  const selectedTags = allTags.filter(t => selected.includes(t.id));

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <TagIcon size={12} />
        {selectedTags.length === 0 ? (
          <span>Add tags</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {selectedTags.map(t => (
              <span
                key={t.id}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: t.color + "33", color: t.color }}
              >
                {t.name}
              </span>
            ))}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 left-0 bg-card border border-border rounded-lg shadow-lg p-2 w-64 space-y-2">
            <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-0.5">
              {allTags.length === 0 && (
                <p className="text-xs text-muted-foreground p-2">No tags yet — create one below.</p>
              )}
              {allTags.map(t => {
                const on = selected.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary text-xs"
                  >
                    <span
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="flex-1 text-left text-foreground">{t.name}</span>
                    {on && <Check size={12} className="text-primary" />}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-border pt-2 space-y-1.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createTag()}
                placeholder="New tag name…"
                className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-1">
                {PALETTE.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-4 h-4 rounded-sm transition-transform ${newColor === c ? "ring-2 ring-offset-1 ring-offset-card ring-foreground scale-110" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <button
                  onClick={createTag}
                  disabled={!newName.trim()}
                  className="ml-auto bg-primary text-primary-foreground rounded px-2 py-0.5 text-xs disabled:opacity-30"
                >
                  <Plus size={10} className="inline" /> Add
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Compact inline tag display for cards/sidebars (read-only). */
export function TagChips({ kind, ownerId }: Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const joinTable = kind === "note" ? "note_tags" : "list_tags";
  const ownerCol = kind === "note" ? "note_id" : "list_id";
  useEffect(() => {
    let cancel = false;
    supabase.from(joinTable).select("tag_id, tags(*)").eq(ownerCol, ownerId).then(({ data }) => {
      if (cancel || !data) return;
      setTags(data.map((r: any) => r.tags).filter(Boolean));
    });
    return () => { cancel = true; };
  }, [joinTable, ownerCol, ownerId]);
  if (tags.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map(t => (
        <span
          key={t.id}
          className="px-1.5 py-0.5 rounded text-[9px] font-medium"
          style={{ backgroundColor: t.color + "33", color: t.color }}
        >
          {t.name}
        </span>
      ))}
    </span>
  );
}
