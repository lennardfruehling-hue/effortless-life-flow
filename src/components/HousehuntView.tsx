import { useState } from "react";
import { BedDouble, ExternalLink, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { HOUSE_STAGES, HOUSE_STAGE_LABELS, HouseListing, HouseStage, safeDaftUrl, sortHouseListings } from "@/lib/househunt";
import { useHousehunt } from "@/hooks/useHousehunt";
const euros = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
export default function HousehuntView() {
  const { rows, loading, saving, error, refresh, patch } = useHousehunt();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ notes: "", nextAction: "" });
  const [initial, setInitial] = useState({ notes: "", nextAction: "" });
  const selected = rows.find(x => x.id === selectedId);
  function open(row: HouseListing) {
    const fields = { notes: row.notes ?? "", nextAction: row.nextAction ?? "" };
    setSelectedId(row.id); setDraft(fields); setInitial(fields);
  }
  async function move(id: string, stage: HouseStage) {
    try { await patch(id, { stage }); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not move listing."); }
  }
  async function save() {
    if (!selected) return;
    const fields = { ...(draft.notes !== initial.notes ? { notes: draft.notes } : {}), ...(draft.nextAction !== initial.nextAction ? { nextAction: draft.nextAction } : {}) };
    try { await patch(selected.id, fields); setInitial(draft); toast.success("Listing saved"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save listing."); }
  }
  const summary = [{ label: "Enquired", value: rows.filter(x => x.stage === "enquired").length }, { label: "Replied", value: rows.filter(x => x.stage === "replied").length }, { label: "Viewings booked", value: rows.filter(x => x.stage === "viewing").length }, { label: "Top score", value: rows.length ? Math.max(...rows.map(x => x.score)) : "—" }];
  return <div className="h-full flex flex-col min-w-0">
    <header className="px-4 sm:px-6 py-5 border-b border-border space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold flex items-center gap-2"><Home size={20} />Househunt</h1><Button variant="ghost" size="icon" aria-label="Refresh Househunt" title="Refresh Househunt" disabled={loading || saving} onClick={() => void refresh()}><RefreshCw size={16} /></Button></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{summary.map(s => <div key={s.label}><div className="text-xl font-semibold tabular-nums">{s.value}</div><div className="text-xs text-muted-foreground">{s.label}</div></div>)}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </header>
    {loading ? <p className="p-6 text-muted-foreground">Loading listings…</p> : <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
      <div className="flex gap-4 min-w-max h-full">{HOUSE_STAGES.map(stage => {
        const cards = sortHouseListings(rows.filter(x => x.stage === stage));
        return <section key={stage} aria-label={HOUSE_STAGE_LABELS[stage]} className="w-64 shrink-0 flex flex-col" onDragOver={e => { if (!saving) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("text/househunt-id"); if (id && !saving) void move(id, stage); }}>
          <h2 className="text-sm font-medium mb-3 flex justify-between items-center">{HOUSE_STAGE_LABELS[stage]}<Badge variant="secondary">{cards.length}</Badge></h2>
          <div className="space-y-2 pb-4">{cards.map(row => <Button key={row.id} draggable={!saving} onDragStart={e => { e.dataTransfer.setData("text/househunt-id", row.id); e.dataTransfer.effectAllowed = "move"; }} variant="outline" className="w-full h-auto p-3 rounded-md justify-start text-left whitespace-normal block bg-card" onClick={() => open(row)}>
            <div className="flex items-start justify-between gap-2"><span className="font-medium break-words min-w-0">{row.town}</span><Badge variant={row.score >= 80 ? "default" : "secondary"} className="shrink-0 text-xs">{row.score}</Badge></div>
            <div className="flex items-center gap-3 mt-2 text-sm"><span className="font-semibold">{euros(row.price)}<span className="text-xs font-normal text-muted-foreground"> /mo</span></span><span className="flex gap-1 items-center text-muted-foreground"><BedDouble size={14} />{row.beds}</span></div>
            {row.nextAction && <p className="mt-2 text-xs text-muted-foreground break-words">{row.nextAction}</p>}
          </Button>)}{!cards.length && <div className="border border-dashed border-border rounded-md p-4 text-xs text-muted-foreground">No listings</div>}</div>
        </section>;
      })}</div>
    </div>}
    <Sheet open={selectedId !== null} onOpenChange={open => { if (!open) setSelectedId(null); }}><SheetContent className="w-full sm:max-w-lg overflow-y-auto">
      <SheetHeader><SheetTitle>{selected?.town ?? "Listing details"}</SheetTitle></SheetHeader>
      {selected ? <div className="mt-5 space-y-5">
        <p className="font-medium">{selected.address}</p>
        <div className="grid grid-cols-2 gap-4 text-sm">{Object.entries({ "Listing ID": selected.id, "Rent / month": euros(selected.price), Beds: selected.beds, Type: selected.type, BER: selected.ber, Commute: selected.commute, Score: `${selected.score}/100`, "Sent on": selected.sentAt }).map(([label, value]) => <div key={label} className="min-w-0"><p className="text-xs text-muted-foreground mb-1">{label}</p><p className="break-words">{value || "—"}</p></div>)}</div>
        {safeDaftUrl(selected.url) ? <Button asChild variant="outline"><a href={safeDaftUrl(selected.url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} className="mr-2" />Open on Daft</a></Button> : <p className="text-xs text-muted-foreground break-all">{selected.url || "No Daft link"}</p>}
        <div className="space-y-2"><Label>Stage</Label><Select value={selected.stage} disabled={saving} onValueChange={stage => void move(selected.id, stage as HouseStage)}><SelectTrigger aria-label="Listing stage"><SelectValue /></SelectTrigger><SelectContent>{HOUSE_STAGES.map(stage => <SelectItem key={stage} value={stage}>{HOUSE_STAGE_LABELS[stage]}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="house-next">Next action</Label><Input id="house-next" value={draft.nextAction} onChange={e => setDraft(x => ({ ...x, nextAction: e.target.value }))} /></div>
        <div className="space-y-2"><Label htmlFor="house-notes">Notes</Label><Textarea id="house-notes" rows={5} value={draft.notes} onChange={e => setDraft(x => ({ ...x, notes: e.target.value }))} /></div>
        <Button disabled={saving || (draft.notes === initial.notes && draft.nextAction === initial.nextAction)} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</Button>
        <div className="border-t border-border pt-4"><h3 className="text-sm font-medium mb-3">History</h3><ol className="space-y-2">{(selected.history ?? []).map((entry, i) => <li key={`${entry.date}-${i}`} className="flex gap-3 text-sm"><span className="text-muted-foreground tabular-nums">{entry.date}</span><span>{HOUSE_STAGE_LABELS[entry.stage] ?? entry.stage}</span></li>)}</ol></div>
      </div> : <p className="mt-5 text-muted-foreground">This listing is no longer available.</p>}
    </SheetContent></Sheet>
  </div>;
}