import { z } from 'zod';

/**
 * The `POST /sessions/:id/observations` request body — one of the three
 * places Zod belongs (PRD §7.8: "client/server API"). This is genuinely
 * untrusted input: whatever eventually calls this (the post-session
 * analyser, ticket #14+) is a separate process across a network boundary.
 */
export const recordObservationsRequestSchema = z.object({
  // Validated as a well-formed UUID, not just non-empty (ticket #26 AC
  // #1) — whether it's a *real* learner is left to the database's FK
  // constraint (ticket #26 AC #3), not duplicated here.
  learnerId: z.string().uuid(),
  observations: z.array(z.object({
    kind: z.string().min(1),
    structureKey: z.string().min(1).optional(),
    impeded: z.boolean().optional(),
    detail: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
});

export type RecordObservationsRequest = z.infer<typeof recordObservationsRequestSchema>;
