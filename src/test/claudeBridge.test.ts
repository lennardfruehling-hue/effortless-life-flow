import { describe, expect, it } from "vitest";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { mergeCloudArrays } from "@/lib/cloudMerge";
import { prepareJobRecord, withJobStage } from "@/lib/jobHuntActions";
import { setTaskCompleted } from "@/lib/taskCompletion";
describe("Claude bridge shared rules", () => {
  it("rejects external login redirects and preserves local consent parameters", () => {
    expect(oauthReturnPath("/\\evil.example")).toBe("/"); expect(oauthReturnPath("//evil.example")).toBe("/");
    expect(oauthReturnPath("/.lovable/oauth/consent?authorization_id=123#return")).toBe("/.lovable/oauth/consent?authorization_id=123#return");
  });
  it("does not overwrite remote edits with unchanged local copies", () => {
    const base = [{ id: "a", title: "old" }];
    expect(mergeCloudArrays([{ id: "a", title: "Claude edit" }, { id: "b", title: "new" }], base, base)).toEqual([{ id: "a", title: "Claude edit" }, { id: "b", title: "new" }]);
  });
  it("keeps remote deletion and applies intentional local deletion", () => {
    const base = [{ id: "a" }]; expect(mergeCloudArrays([], base, base)).toEqual([]); expect(mergeCloudArrays(base, [], base)).toEqual([]);
  });
  it("records applied stage and its seven-day follow-up", () => {
    const job = withJobStage({ stage: "wishlist", history: [] }, "applied", new Date("2026-11-05T12:00:00Z")) as any;
    expect(job.appliedDate).toBe("2026-11-05"); expect(job.followUpDate).toBe("2026-11-12"); expect(job.history).toEqual([{ stage: "applied", date: "2026-11-05" }]);
  });
  it("validates required application fields", () => expect(() => prepareJobRecord("jobs", { company: "" }, undefined, "1")).toThrow("Company and role"));
  it("completes recurring tasks with the app period", () => {
    const task = setTaskCompleted({ id: "a", title: "Test", completed: false, categories: ["A1"], createdAt: "2026-11-05", recurrence: "daily" }, true, new Date("2026-11-05T12:00:00Z"));
    expect(task.completed).toBe(true); expect(task.lastCompletedPeriod).toBe("2026-11-05");
  });
});