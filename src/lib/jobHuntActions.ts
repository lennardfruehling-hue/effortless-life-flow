import { z } from "zod";
import { CLOUD_KEYS } from "./cloudKeys";

const text = z.string();
const date = text.refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "Use YYYY-MM-DD dates");
export const jobStage = z.enum(["wishlist", "preparing", "applied", "screening", "interview", "offer", "accepted", "closed"]);
const applicationFields = z.object({
  company: text, role: text, link: text.optional(), location: text.optional(),
  workMode: z.enum(["remote", "hybrid", "onsite"]).optional(),
  jobType: z.enum(["full-time", "part-time", "contract", "internship"]).optional(),
  salary: text.optional(), source: text.optional(), contact: text.optional(), contactId: text.optional(), resumeId: text.optional(),
  excitement: z.number().min(0).max(5).optional(), fit: z.number().min(0).max(5).optional(), notes: text.optional(),
  priority: z.enum(["high", "medium", "low"]).optional(), stage: jobStage,
  history: z.array(z.object({ stage: jobStage, date })).optional(),
  appliedDate: date.optional(), followUpDate: date.optional(), nextStep: text.optional(), nextStepDate: date.optional(), deadline: date.optional(),
}).partial().strict();
export const JOB_COLLECTIONS = {
  jobs: CLOUD_KEYS.jobs, jobContacts: CLOUD_KEYS.jobContacts, jobInterviews: CLOUD_KEYS.jobInterviews,
  jobCompanies: CLOUD_KEYS.jobCompanies, jobResumes: CLOUD_KEYS.jobResumes,
} as const;
export type JobCollection = keyof typeof JOB_COLLECTIONS;
const schemas = {
  jobs: applicationFields,
  jobContacts: z.object({ name: text, company: text, title: text, email: text, linkedin: text, relation: text, status: text, lastContact: date, nextFollowUp: date, notes: text }).partial().strict(),
  jobInterviews: z.object({ jobId: text, date: text, round: text, type: text, interviewer: text, prep: text, questions: text, reflection: text, rating: z.number().min(0).max(5), thankYouSent: z.boolean() }).partial().strict(),
  jobCompanies: z.object({ name: text, industry: text, size: text, website: text, status: text, why: text, culture: text, rating: z.number().min(0).max(5) }).partial().strict(),
  jobResumes: z.object({ name: text, kind: text, link: text, version: text, notes: text }).partial().strict(),
};
export const jobGoalFields = z.object({ appsPerWeek: z.number().int().min(1), networkPerWeek: z.number().int().min(1), targetDate: date, targetRole: text, targetSalary: text }).partial().strict();

export function isJobCollection(value: string): value is JobCollection {
  return Object.prototype.hasOwnProperty.call(JOB_COLLECTIONS, value);
}

export function withJobStage<T extends { stage?: string; appliedDate?: string; followUpDate?: string; history?: { stage?: string; date?: string }[] }>(card: T, stage: string, now = new Date()): T {
  jobStage.parse(stage);
  if (card.stage === stage) return card;
  const day = now.toISOString().slice(0, 10);
  const followUp = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  return { ...card, stage, appliedDate: stage === "applied" && !card.appliedDate ? day : card.appliedDate,
    followUpDate: stage === "applied" && !card.followUpDate ? followUp : card.followUpDate,
    history: [...(card.history || []), { stage, date: day }], updatedAt: now.toISOString() };
}

export function prepareJobRecord(collection: JobCollection, fields: unknown, existing?: Record<string, any>, id?: string, now = new Date()): Record<string, any> {
  const patch: Record<string, any> = schemas[collection].parse(fields);
  const timestamp = now.toISOString();
  if (collection !== "jobs") {
    const next: Record<string, any> = { ...existing, ...patch, id: existing?.id ?? id, updatedAt: timestamp };
    if (!existing && collection !== "jobInterviews" && !String(next.name || "").trim()) throw new Error("A name is required");
    return next;
  }
  const initial = existing ?? { id, company: "", role: "", stage: "wishlist", priority: "medium", history: [], createdAt: timestamp };
  const merged: Record<string, any> = { ...initial, ...patch, id: initial.id, createdAt: initial.createdAt, updatedAt: timestamp };
  if (!String(merged.company).trim() || !String(merged.role).trim()) throw new Error("Company and role are required");
  const next: Record<string, any> = withJobStage<Record<string, any>>({ ...merged, stage: existing?.stage ?? "wishlist" }, merged.stage, now);
  if (!existing && !next.history?.length) next.history = [{ stage: next.stage, date: timestamp.slice(0, 10) }];
  return next;
}