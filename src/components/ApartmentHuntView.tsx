import { useState, DragEvent } from "react";
import { CLOUD_KEYS } from "@/lib/cloudStore";
import { useCloudState } from "@/hooks/useCloudState";
import { Plus, Trash2, ExternalLink, GripVertical, MapPin, Euro, Pencil, X } from "lucide-react";

export interface ApartmentCard {
  id: string;
  address: string;
  link?: string;
  price?: string;
  description?: string;
  stage: string;
  createdAt: string;
  updatedAt: string;
}

export const APARTMENT_STAGES = [
  { id: "discovered", label: "Discovered", color: "hsl(220 60% 55%)" },
  { id: "contacted", label: "Contacted", color: "hsl(280 55% 55%)" },
  { id: "viewing", label: "Viewing Scheduled", color: "hsl(35 90% 55%)" },
  { id: "viewed", label: "Viewed", color: "hsl(200 70% 50%)" },
  { id: "applied", label: "Applied", color: "hsl(160 60% 45%)" },
  { id: "accepted", label: "Accepted", color: "hsl(140 65% 45%)" },
  { id: "rejected", label: "Rejected / Passed", color: "hsl(0 60% 55%)" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ApartmentHuntView() {
  const [cards, setCards, loaded] = useCloudState<ApartmentCard[]>(CLOUD_KEYS.apartments, []);
  const [editing, setEditing] = useState<ApartmentCard | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const addCard = (stage: string) => {
    const now = new Date().toISOString();
    const c: ApartmentCard = {
      id: uid(),
      address: "",
      link: "",
      price: "",
      description: "",
      stage,
      createdAt: now,
      updatedAt: now,
    };
    setCards((prev) => [...prev, c]);
    setEditing(c);
  };

  const saveCard = (c: ApartmentCard) => {
    setCards((prev) => prev.map((x) => (x.id === c.id ? { ...c, updatedAt: new Date().toISOString() } : x)));
    setEditing(null);
  };

  const deleteCard = (id: string) => {
    setCards((prev) => prev.filter((x) => x.id !== id));
    setEditing(null);
  };

  const moveCard = (id: string, stage: string) => {
    setCards((prev) => prev.map((x) => (x.id === id ? { ...x, stage, updatedAt: new Date().toISOString() } : x)));
  };

  const onDrop = (e: DragEvent, stage: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/apartment") || dragId;
    if (id) moveCard(id, stage);
    setDragId(null);
  };

  if (!loaded) return <div className="p-6 text-sm text-muted-foreground">Loading apartment hunt…</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Apartment Hunt</h2>
          <p className="text-xs text-muted-foreground">
            Drag cards between stages. AI-editable via chat.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {cards.length} {cards.length === 1 ? "listing" : "listings"}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-4 h-full min-w-max">
          {APARTMENT_STAGES.map((stage) => {
            const items = cards.filter((c) => c.stage === stage.id);
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, stage.id)}
                className="flex flex-col w-72 bg-secondary/30 rounded-lg border border-border/40"
              >
                <div
                  className="flex items-center justify-between px-3 py-2 border-b border-border/40 rounded-t-lg"
                  style={{ borderTop: `3px solid ${stage.color}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                    <span className="text-sm font-medium">{stage.label}</span>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <button
                    onClick={() => addCard(stage.id)}
                    className="p-1 rounded hover:bg-background/60"
                    title="Add card"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {items.length === 0 && (
                    <div className="text-xs text-muted-foreground/60 italic text-center py-4">
                      Drop cards here
                    </div>
                  )}
                  {items.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        setDragId(c.id);
                        e.dataTransfer.setData("text/apartment", c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => setEditing(c)}
                      className="group bg-card border border-border/50 rounded-md p-2.5 cursor-pointer hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start gap-1.5">
                        <GripVertical size={12} className="text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {c.address || <span className="text-muted-foreground italic">Untitled</span>}
                          </div>
                          {c.price && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Euro size={10} /> {c.price}
                            </div>
                          )}
                          {c.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {c.description}
                            </div>
                          )}
                          {c.link && (
                            <a
                              href={c.link}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                            >
                              <ExternalLink size={10} /> Link
                            </a>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCard(c.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-destructive"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <EditDialog
          card={editing}
          onClose={() => setEditing(null)}
          onSave={saveCard}
          onDelete={() => deleteCard(editing.id)}
        />
      )}
    </div>
  );
}

function EditDialog({
  card,
  onClose,
  onSave,
  onDelete,
}: {
  card: ApartmentCard;
  onClose: () => void;
  onSave: (c: ApartmentCard) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<ApartmentCard>(card);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Pencil size={14} /> Apartment
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <MapPin size={11} /> Address
            </div>
            <input
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              placeholder="123 Main St, Dublin"
              className="w-full px-2.5 py-1.5 text-sm bg-secondary/40 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </label>

          <label className="block">
            <div className="text-xs font-medium text-muted-foreground mb-1">Link</div>
            <input
              value={draft.link || ""}
              onChange={(e) => setDraft({ ...draft, link: e.target.value })}
              placeholder="https://daft.ie/..."
              className="w-full px-2.5 py-1.5 text-sm bg-secondary/40 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="block">
            <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Euro size={11} /> Price
            </div>
            <input
              value={draft.price || ""}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              placeholder="1,800/month"
              className="w-full px-2.5 py-1.5 text-sm bg-secondary/40 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="block">
            <div className="text-xs font-medium text-muted-foreground mb-1">Description / notes</div>
            <textarea
              value={draft.description || ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={4}
              placeholder="2 bed, top floor, near tram, pet friendly..."
              className="w-full px-2.5 py-1.5 text-sm bg-secondary/40 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </label>

          <label className="block">
            <div className="text-xs font-medium text-muted-foreground mb-1">Stage</div>
            <select
              value={draft.stage}
              onChange={(e) => setDraft({ ...draft, stage: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-secondary/40 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {APARTMENT_STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <button
            onClick={onDelete}
            className="text-xs text-destructive hover:underline flex items-center gap-1"
          >
            <Trash2 size={12} /> Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded hover:bg-secondary">
              Cancel
            </button>
            <button
              onClick={() => onSave(draft)}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
