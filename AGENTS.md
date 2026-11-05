# Architecture rules
- Job Hunt assistant field validation and stage transitions live in `src/lib/jobHuntActions.ts`; both chat actions and the pipeline reuse stage handling to keep timelines and follow-ups consistent.
- Organization chat uses the existing `serpent-voice` boundary and `voiceActions` approval gate; Job Hunt data is loaded from the same cloud keys as Notes to avoid a second source of truth.
- AI edge functions use `_shared/gateway.ts` and preserve existing frontend reply contracts; the Anthropic helper remains unused for rollback.
- Pure cloud key constants and task completion helpers are separate from browser storage so server tools can reuse domain rules safely.
- Cloud array saves use three-way id merges and optimistic row-version checks to retain concurrent edits and intentional deletions.
- Househunt uses its own personal key outside global cache hydration, fresh server reads, and field-level optimistic patches so external listing imports cannot be overwritten by stale drafts.
