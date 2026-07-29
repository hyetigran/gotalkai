import { z } from 'zod';

/**
 * `POST /learners/:id/memories` request body — the client/server API
 * boundary Zod belongs at (PRD §7.8). Genuinely untrusted: whatever
 * eventually calls this (the post-session analyser, ticket #14+) is a
 * separate process across a network boundary. `learnerId` comes from the
 * URL path, not duplicated in the body — memories are learner-scoped
 * (`persona_memories` has no `session_id` column, ticket #19's schema),
 * so a `/sessions/:id/...` path would imply a session association this
 * table doesn't actually have.
 */
export const recordMemoryRequestSchema = z.object({
  content: z.string().min(1),
});

export type RecordMemoryRequest = z.infer<typeof recordMemoryRequestSchema>;
