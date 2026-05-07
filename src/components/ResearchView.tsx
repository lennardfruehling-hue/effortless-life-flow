import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { ResearchNoteRow, NoteBlock, BlockType, Project } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Trash2, BookOpen, FileText, Image as ImageIcon, Paperclip,
  CheckSquare, Square, Type, Heading1, Heading2, Heading3, List as ListIcon,
  Minus, Quote, Code, Loader2, Link2, X, Lock, Unlock, ChevronRight, ChevronDown, FolderOpen, Tag as TagIcon
} from "lucide-react";
import TagPicker, { TagChips } from "./TagPicker";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { AssigneeAvatar } from "./AssigneePicker";

// Auto-growing textarea: expands to fit content, no scrollbars.
function AutoTextarea({
  value, onChange, onKeyDown, placeholder, className, minRows = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={minRows}
      className={className}
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
}

interface Props {
  projects: Project[];
}

const BLOCK_MENU: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "heading1", label: "Heading 1", icon: Heading1 },
  { type: "heading2", label: "Heading 2", icon: Heading2 },
  { type: "heading3", label: "Heading 3", icon: Heading3 },
  { type: "checklist", label: "To-do", icon: CheckSquare },
  { type: "bullet", label: "Bullet list", icon: ListIcon },
  { type: "quote", label: "Quote", icon: Quote },
  { type: "code", label: "Code", icon: Code },
  { type: "divider", label: "Divider", icon: Minus },
];

// Debounced saver — coalesces rapid keystrokes into one DB write per (table,id,field).
function useDebouncedSaver() {
  const timers = useRef<Record<string, number>>({});
  return useCallback((key: string, fn: () => Promise<unknown> | unknown, delay = 400) => {
    const existing = timers.current[key];
    if (existing) window.clearTimeout(existing);
    timers.current[key] = window.setTimeout(() => {
      void fn();
      delete timers.current[key];
    }, delay) as unknown as number;
  }, []);
}

export default function ResearchView({ projects }: Props) {
  const { members, byId } = useHouseholdMembers();
  const [notes, setNotes] = useState<ResearchNoteRow[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<"project" | "tag">("project");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [noteTagMap, setNoteTagMap] = useState<Record<string, string[]>>({});
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const debounce = useDebouncedSaver();

  const loadTagsAndLinks = useCallback(async () => {
    const [{ data: tags }, { data: links }] = await Promise.all([
      supabase.from("tags").select("*").order("name"),
      supabase.from("note_tags").select("note_id, tag_id"),
    ]);
    if (tags) setAllTags(tags as any);
    if (links) {
      const map: Record<string, string[]> = {};
      (links as any[]).forEach((l) => {
        (map[l.note_id] = map[l.note_id] || []).push(l.tag_id);
      });
      setNoteTagMap(map);
    }
  }, []);
  useEffect(() => { loadTagsAndLinks(); }, [loadTagsAndLinks]);

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const loadNotes = useCallback(async () => {
    const { data } = await supabase.from("research_notes").select("*").order("updated_at", { ascending: false });
    if (data) setNotes(data as ResearchNoteRow[]);
    setLoading(false);
  }, []);

  const loadBlocks = useCallback(async (noteId: string) => {
    const { data } = await supabase.from("note_blocks").select("*").eq("note_id", noteId).order("position");
    if (data) setBlocks(data as NoteBlock[]);
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);
  useEffect(() => {
    const handler = () => { loadNotes(); if (activeNoteId) loadBlocks(activeNoteId); };
    window.addEventListener("research-updated", handler);
    return () => window.removeEventListener("research-updated", handler);
  }, [loadNotes, loadBlocks, activeNoteId]);

  useEffect(() => {
    if (activeNoteId) loadBlocks(activeNoteId);
    else setBlocks([]);
  }, [activeNoteId, loadBlocks]);

  const activeNote = notes.find(n => n.id === activeNoteId);

  // Build groups
  const UNCATEGORIZED = "__none__";
  const groups: { key: string; label: string; color?: string; notes: ResearchNoteRow[] }[] = (() => {
    if (groupBy === "project") {
      const map = new Map<string, ResearchNoteRow[]>();
      notes.forEach(n => {
        const key = n.project_id || UNCATEGORIZED;
        (map.get(key) || map.set(key, []).get(key)!).push(n);
      });
      const result: { key: string; label: string; notes: ResearchNoteRow[] }[] = [];
      projects.forEach(p => {
        if (map.has(p.id)) result.push({ key: p.id, label: p.name, notes: map.get(p.id)! });
      });
      if (map.has(UNCATEGORIZED)) result.push({ key: UNCATEGORIZED, label: "No project", notes: map.get(UNCATEGORIZED)! });
      return result;
    } else {
      const result: { key: string; label: string; color?: string; notes: ResearchNoteRow[] }[] = [];
      allTags.forEach(t => {
        const inTag = notes.filter(n => (noteTagMap[n.id] || []).includes(t.id));
        if (inTag.length > 0) result.push({ key: t.id, label: t.name, color: t.color, notes: inTag });
      });
      const untagged = notes.filter(n => !(noteTagMap[n.id] && noteTagMap[n.id].length > 0));
      if (untagged.length > 0) result.push({ key: UNCATEGORIZED, label: "Untagged", notes: untagged });
      return result;
    }
  })();

  const createNote = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("research_notes")
      .insert({ title: "Untitled", project_id: null, created_by: user?.id ?? null })
      .select().single();
    if (data) {
      await supabase.from("note_blocks").insert({ note_id: data.id, position: 0, block_type: "text", content: "" });
      await loadNotes();
      setActiveNoteId(data.id);
    }
  };

  const deleteNote = async (id: string) => {
    await supabase.from("research_notes").delete().eq("id", id);
    if (activeNoteId === id) setActiveNoteId(null);
    loadNotes();
  };

  // Optimistic + debounced — fixes typing lag in headline.
  const updateNote = (patch: Partial<ResearchNoteRow>) => {
    if (!activeNote) return;
    const id = activeNote.id;
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } as ResearchNoteRow : n));
    debounce(`note:${id}:${Object.keys(patch).join(",")}`, async () => {
      await supabase.from("research_notes").update(patch).eq("id", id);
    });
  };

  const addBlock = async (type: BlockType, afterPos?: number) => {
    if (!activeNoteId) return;
    const pos = afterPos !== undefined ? afterPos + 1 : blocks.length;
    const toShift = blocks.filter(b => b.position >= pos);
    for (const b of toShift) {
      await supabase.from("note_blocks").update({ position: b.position + 1 }).eq("id", b.id);
    }
    const { data } = await supabase
      .from("note_blocks")
      .insert({ note_id: activeNoteId, position: pos, block_type: type, content: type === "divider" ? null : "" })
      .select().single();
    if (data) {
      await loadBlocks(activeNoteId);
    }
    setShowBlockMenu(false);
  };

  // Optimistic + debounced for block edits too.
  const updateBlock = (id: string, patch: Partial<NoteBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } as NoteBlock : b));
    debounce(`block:${id}:${Object.keys(patch).join(",")}`, async () => {
      await supabase.from("note_blocks").update(patch).eq("id", id);
    });
  };

  const deleteBlock = async (id: string) => {
    await supabase.from("note_blocks").delete().eq("id", id);
    if (activeNoteId) loadBlocks(activeNoteId);
  };

  const uploadFile = async (file: File, asImage: boolean) => {
    if (!activeNoteId) return;
    const path = `${activeNoteId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("research-files").upload(path, file);
    if (error) { console.error(error); return; }
    const { data: pub } = supabase.storage.from("research-files").getPublicUrl(path);
    await supabase.from("note_blocks").insert({
      note_id: activeNoteId,
      position: blocks.length,
      block_type: asImage ? "image" : "file",
      file_url: pub.publicUrl,
      file_name: file.name,
      file_type: file.type,
    });
    loadBlocks(activeNoteId);
  };

  return (
    <div className="flex-1 flex h-screen overflow-hidden">
      {/* Notes sidebar */}
      <div className="w-56 lg:w-72 flex-shrink-0 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BookOpen size={18} className="text-primary" /> Notes
            </h2>
            <button onClick={createNote} className="bg-primary text-primary-foreground p-1.5 rounded hover:opacity-90" title="New note">
              <Plus size={14} />
            </button>
          </div>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value as any)}
            className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {loading ? (
            <div className="flex justify-center p-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
          ) : filteredNotes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No notes yet. Click + to start.</p>
          ) : filteredNotes.map(note => {
            const proj = projects.find(p => p.id === note.project_id);
            return (
              <button
                key={note.id}
                onClick={() => setActiveNoteId(note.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm group transition-colors ${
                  activeNoteId === note.id ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{note.icon || "📄"}</span>
                  <span className="truncate flex-1">{note.title || "Untitled"}</span>
                  {note.assignee_id && <AssigneeAvatar member={byId(note.assignee_id)} />}
                  <Trash2
                    size={12}
                    onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  />
                </div>
                {proj && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 ml-6">
                    <Link2 size={9} /> {proj.name}
                  </div>
                )}
                <div className="ml-6 mt-0.5"><TagChips kind="note" ownerId={note.id} /></div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {!activeNote ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <FileText size={56} className="text-primary/20 mb-4" />
            <p className="text-muted-foreground">Select a note or create a new one</p>
            <p className="text-xs text-muted-foreground mt-1">Notion-style blocks · images · file attachments</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto px-12 py-8 space-y-1">
            {/* Header: icon + title + project link */}
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => {
                  const next = prompt("Emoji icon", activeNote.icon || "📄");
                  if (next !== null) updateNote({ icon: next || null });
                }}
                className="text-4xl hover:bg-secondary rounded p-1"
              >
                {activeNote.icon || "📄"}
              </button>
              <AutoTextarea
                value={activeNote.title}
                onChange={(v) => updateNote({ title: v })}
                placeholder="Untitled"
                className="flex-1 bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground focus:outline-none leading-tight"
              />
            </div>
            <div className="flex items-center gap-3 mb-6 ml-1 flex-wrap">
              <div className="flex items-center gap-2">
                <Link2 size={12} className="text-muted-foreground" />
                <select
                  value={activeNote.project_id || ""}
                  onChange={(e) => updateNote({ project_id: e.target.value || null })}
                  className="bg-transparent text-xs text-muted-foreground border-none focus:outline-none cursor-pointer hover:text-foreground"
                >
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <TagPicker kind="note" ownerId={activeNote.id} />
              <button
                onClick={() => updateNote({ is_private: !activeNote.is_private } as any)}
                title={activeNote.is_private ? "Private to you" : "Shared with household"}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${activeNote.is_private ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {activeNote.is_private ? <Lock size={11} /> : <Unlock size={11} />}
                {activeNote.is_private ? "Private" : "Shared"}
              </button>
              {members.length >= 1 && (
                <div className="flex items-center gap-1 ml-auto">
                  <AssigneeAvatar member={byId(activeNote.assignee_id)} size="md" />
                  <select
                    value={activeNote.assignee_id || ""}
                    onChange={(e) => updateNote({ assignee_id: e.target.value || null } as any)}
                    className="bg-transparent text-xs text-foreground border-none focus:outline-none cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || "Member"}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Blocks */}
            <div className="space-y-1">
              {blocks.map((block) => (
                <BlockEditor
                  key={block.id}
                  block={block}
                  onUpdate={(patch) => updateBlock(block.id, patch)}
                  onDelete={() => deleteBlock(block.id)}
                  onAddBelow={(t) => addBlock(t, block.position)}
                />
              ))}
            </div>

            {/* Add block */}
            <div className="pt-4 relative">
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f, f.type.startsWith("image/"));
                e.target.value = "";
              }} />
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowBlockMenu(s => !s)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary/40 rounded px-3 py-1.5"
                >
                  <Plus size={12} /> Add block
                </button>
                <button
                  onClick={() => { if (fileRef.current) { fileRef.current.accept = "image/*"; fileRef.current.click(); } }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary/40 rounded px-3 py-1.5"
                >
                  <ImageIcon size={12} /> Image
                </button>
                <button
                  onClick={() => { if (fileRef.current) { fileRef.current.accept = "*/*"; fileRef.current.click(); } }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary/40 rounded px-3 py-1.5"
                >
                  <Paperclip size={12} /> File
                </button>
              </div>
              {showBlockMenu && (
                <div className="absolute z-10 mt-2 bg-card border border-border rounded-lg shadow-lg p-1 w-56">
                  {BLOCK_MENU.map(({ type, label, icon: Icon }) => (
                    <button
                      key={type}
                      onClick={() => addBlock(type)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-secondary rounded text-left"
                    >
                      <Icon size={14} className="text-muted-foreground" /> {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockEditor({
  block, onUpdate, onDelete, onAddBelow,
}: {
  block: NoteBlock;
  onUpdate: (p: Partial<NoteBlock>) => void;
  onDelete: () => void;
  onAddBelow: (t: BlockType) => void;
}) {
  const wrap = "group relative flex items-start gap-1";
  const handle = (
    <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 mt-1.5 transition-opacity flex-shrink-0">
      <X size={12} />
    </button>
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && block.block_type !== "code") {
      e.preventDefault();
      onAddBelow(block.block_type === "checklist" || block.block_type === "bullet" ? block.block_type : "text");
    }
  };

  switch (block.block_type) {
    case "heading1":
      return <div className={wrap}>
        <AutoTextarea value={block.content || ""} onChange={(v) => onUpdate({ content: v })} onKeyDown={onKey}
          placeholder="Heading 1"
          className="flex-1 bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground focus:outline-none py-1 leading-tight" />
        {handle}
      </div>;
    case "heading2":
      return <div className={wrap}>
        <AutoTextarea value={block.content || ""} onChange={(v) => onUpdate({ content: v })} onKeyDown={onKey}
          placeholder="Heading 2"
          className="flex-1 bg-transparent text-2xl font-bold text-foreground placeholder:text-muted-foreground focus:outline-none py-1 leading-tight" />
        {handle}
      </div>;
    case "heading3":
      return <div className={wrap}>
        <AutoTextarea value={block.content || ""} onChange={(v) => onUpdate({ content: v })} onKeyDown={onKey}
          placeholder="Heading 3"
          className="flex-1 bg-transparent text-xl font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none py-1 leading-tight" />
        {handle}
      </div>;
    case "checklist":
      return <div className={wrap}>
        <button onClick={() => onUpdate({ checked: !block.checked })} className="mt-1 text-primary">
          {block.checked ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>
        <AutoTextarea value={block.content || ""} onChange={(v) => onUpdate({ content: v })} onKeyDown={onKey}
          placeholder="To-do"
          className={`flex-1 bg-transparent text-sm focus:outline-none py-0.5 ${block.checked ? "line-through text-muted-foreground" : "text-foreground"}`} />
        {handle}
      </div>;
    case "bullet":
      return <div className={wrap}>
        <span className="text-foreground mt-1.5">•</span>
        <AutoTextarea value={block.content || ""} onChange={(v) => onUpdate({ content: v })} onKeyDown={onKey}
          placeholder="List item"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5" />
        {handle}
      </div>;
    case "quote":
      return <div className={wrap}>
        <textarea value={block.content || ""} onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="Quote"
          rows={2}
          className="flex-1 bg-transparent text-sm italic text-foreground placeholder:text-muted-foreground focus:outline-none border-l-4 border-primary/40 pl-3 py-1 resize-none" />
        {handle}
      </div>;
    case "code":
      return <div className={wrap}>
        <textarea value={block.content || ""} onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="// code"
          rows={3}
          className="flex-1 bg-secondary border border-border rounded px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none resize-none" />
        {handle}
      </div>;
    case "divider":
      return <div className={wrap}>
        <hr className="flex-1 border-border my-2" />
        {handle}
      </div>;
    case "image":
      return <div className={wrap}>
        <div className="flex-1">
          {block.file_url && <img src={block.file_url} alt={block.file_name || ""} className="rounded max-w-full" />}
        </div>
        {handle}
      </div>;
    case "file":
      return <div className={wrap}>
        <a href={block.file_url || "#"} target="_blank" rel="noreferrer" className="flex-1 flex items-center gap-2 bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground hover:bg-secondary/70">
          <Paperclip size={14} className="text-muted-foreground" />
          <span className="truncate">{block.file_name || "File"}</span>
        </a>
        {handle}
      </div>;
    default:
      return <div className={wrap}>
        <AutoTextarea value={block.content || ""} onChange={(v) => onUpdate({ content: v })} onKeyDown={onKey}
          placeholder="Type '/' for commands…"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5" />
        {handle}
      </div>;
  }
}
