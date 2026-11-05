import { describe, expect, it } from "vitest";
import { HOUSEHUNT_KEY, HOUSE_STAGES, changeHouseStage, patchHouseListings, sortHouseListings, type HouseListing } from "@/lib/househunt";
const listing: HouseListing = { id: "123", town: "Bray", address: "Main Street", price: 2200, beds: 2, type: "Apartment", ber: "B2", commute: "45 minutes", score: 92, url: "https://www.daft.ie/123", stage: "found", sentAt: "2026-11-05", notes: "", history: [{ date: "2026-11-05", stage: "found" }] };
describe("Househunt", () => {
  it("uses the requested personal key", () => expect(HOUSEHUNT_KEY).toBe("serpent-househunt"));
  it("preserves the exact stage order", () => expect(HOUSE_STAGES).toEqual(["found", "enquired", "replied", "viewing", "applied", "offered", "let", "closed"]));
  it("appends dated history only when the stage changes", () => {
    const next = changeHouseStage(listing, "viewing", new Date("2026-11-05T22:00:00Z"));
    expect(next.history).toEqual([...listing.history, { date: "2026-11-05", stage: "viewing" }]);
    expect(changeHouseStage(next, "viewing").history).toHaveLength(2);
  });
  it("sorts score descending without mutating input", () => expect(sortHouseListings([{ ...listing, id: "low", score: 30 }, listing]).map(x => x.id)).toEqual(["123", "low"]));
  it("retains externally added rows and freshly updated listing fields", () => {
    const remote = [{ ...listing, price: 2400 }, { ...listing, id: "456", score: 95 }];
    const next = patchHouseListings(remote, "123", { notes: "Call tomorrow", nextAction: "Book viewing" });
    expect(next.map(x => x.id)).toEqual(["123", "456"]); expect(next[0].price).toBe(2400); expect(next[0].notes).toBe("Call tomorrow");
  });
});