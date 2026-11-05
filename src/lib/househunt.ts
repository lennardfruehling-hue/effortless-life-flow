import { z } from "zod";
export const HOUSEHUNT_KEY = "serpent-househunt";
export const HOUSE_STAGES = ["found", "enquired", "replied", "viewing", "applied", "offered", "let", "closed"] as const;
export const houseStageSchema = z.enum(HOUSE_STAGES);
export const HOUSE_STAGE_LABELS: Record<HouseStage, string> = { found: "Found", enquired: "Enquired", replied: "Replied", viewing: "Viewing", applied: "Applied", offered: "Offered", let: "Let", closed: "Closed" };
export type HouseStage = typeof HOUSE_STAGES[number];
export interface HouseListing {
  id: string; town: string; address: string; price: number; beds: number; type: string; ber: string;
  commute: string; score: number; url: string; stage: HouseStage; sentAt: string; notes: string; nextAction?: string;
  history: { date: string; stage: HouseStage }[]; updatedAt?: string;
}
export const dublinDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export function changeHouseStage(listing: HouseListing, stage: HouseStage, now = new Date()): HouseListing {
  houseStageSchema.parse(stage);
  if (listing.stage === stage) return listing;
  return { ...listing, stage, history: [...(listing.history ?? []), { date: dublinDay(now), stage }], updatedAt: now.toISOString() };
}
export const sortHouseListings = (rows: HouseListing[]) => [...rows].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
/** Only the edited fields are applied onto the fresh server record, never the stale detail draft. */
export function patchHouseListings(rows: HouseListing[], id: string, patch: { stage?: HouseStage; notes?: string; nextAction?: string }, now = new Date()): HouseListing[] {
  if (!rows.some(x => x.id === id)) throw new Error("This listing is no longer available. Refresh the board.");
  return rows.map(x => x.id !== id ? x : { ...changeHouseStage(x, patch.stage ?? x.stage, now),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}), ...(patch.nextAction !== undefined ? { nextAction: patch.nextAction } : {}), updatedAt: now.toISOString() });
}
export function safeDaftUrl(url: string): string | undefined {
  try { const parsed = new URL(url); if (parsed.protocol === "https:" && (parsed.hostname === "daft.ie" || parsed.hostname.endsWith(".daft.ie"))) return parsed.href; } catch { /* Invalid link. */ }
}