import { useState, useMemo } from "react";
import { ResearchNote, Project } from "@/lib/types";
import { Plus, Trash2, BookOpen, Link2, Save, X } from "lucide-react";
import { v4 as uuid } from "uuid";

interface ResearchViewProps {
  notes: ResearchNote[];
  projects: Project[];
  onSave: (notes: ResearchNote[]) => void;
}

export default function ResearchView({ notes, projects, onSave }: ResearchViewProps) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<ResearchNote | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [linkProjectId, setLinkProjectId] = useState("");

  const filteredNotes = useMemo(() => {
    if (!activeProjectId) return notes;
    return notes.filter((n) => n.projectId === activeProjectId);
  }, [notes, activeProjectId]);

  const projectTabs = useMemo(() => {
    const ids = new Set(notes.map((n) => n.projectId).filter(Boolean));
    return projects.filter((p) => ids.has(p.id));
  }, [notes, projects]);

  const startNew = () => {
    setEditingNote(null);
    setTitle("");
    setContent("");
    setLinkProjectId(activeProjectId || "");
    setShowForm(true);
  };

  const startEdit = (note: ResearchNote) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setLinkProjectId(note.projectId || "");
    setShowForm(true);
  };

  const saveNote = () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    if (editingNote) {
      onSave(
        notes.map((n) =>
          n.id === editingNote.id
            ? { ...n, title: title.trim(), content: content.trim(), projectId: linkProjectId || undefined, updatedAt: now }
            : n
        )
      );
    } else {
      onSave([
        ...notes,
        {
          id: uuid(),
          title: title.trim(),
          content: content.trim(),
          projectId: linkProjectId || undefined,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
    setShowForm(false);
    setEditingNote(null);
  };

  const deleteNote = (id: string) => {
    onSave(notes.filter((n) => n.id !== id));
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Research</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Save information and link it to your projects
          </p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> Add Note
        </button>
      </div>

      {/* Project tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-thin">
        <button
          onClick={() => setActiveProjectId(null)}
          className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors flex-shrink-0 ${
            !activeProjectId
              ? "bg-primary/20 text-primary border-primary/30"
              : "text-muted-foreground border-border hover:border-primary/20"
          }`}
        >
          All Notes
        </button>
        {projects.map((p) => {
          const count = notes.filter((n) => n.projectId === p.id).length;
          return (
            <button
              key={p.id}
              onClick={() => setActiveProjectId(activeProjectId === p.id ? null : p.id)}
              className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors flex-shrink-0 whitespace-nowrap ${
                activeProjectId === p.id
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "text-muted-foreground border-border hover:border-primary/20"
              }`}
            >
              {p.name}
              {count > 0 && <span className="ml-1.5 text-[10px] opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Notes list */}
      <div className="space-y-3">
        {filteredNotes.map((note) => {
          const linkedProject = projects.find((p) => p.id === note.projectId);
          return (
            <div
              key={note.id}
              className="bg-card border border-border rounded-lg p-4 group cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => startEdit(note)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground text-sm">{note.title}</h3>
                  {linkedProject && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-primary mt-1">
                      <Link2 size={10} /> {linkedProject.name}
                    </span>
                  )}
                  {note.content && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">
                      {note.content}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                    Updated {new Date(note.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNote(note.id);
                  }}
                  className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredNotes.length === 0 && (
        <div className="text-center py-16">
          <BookOpen size={48} className="text-primary/20 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {activeProjectId ? "No research notes for this project" : "No research notes yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Save information, links, and findings linked to your projects
          </p>
        </div>
      )}

      {/* Note form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editingNote ? "Edit Note" : "New Research Note"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Research topic..."
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Link to Project</label>
              <select
                value={linkProjectId}
                onChange={(e) => setLinkProjectId(e.target.value)}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                placeholder="Paste links, notes, findings..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={saveNote}
                disabled={!title.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
              >
                <Save size={14} /> {editingNote ? "Update" : "Save"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
