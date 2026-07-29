import { z } from 'zod';

/**
 * URL path parameters (`:id` segments) are as untrusted as a request
 * body — PRD §7.8's client/server API boundary doesn't stop at JSON
 * bodies. Before this, a malformed id (e.g. `/sessions/not-a-uuid/debrief`)
 * reached Postgres unchecked, which rejected it with a raw type error —
 * caught by the generic catch block and reported as a 503 "database
 * unavailable", misleadingly implying the database itself was down
 * rather than that the caller sent a malformed id (ticket #26 AC #1).
 */
export const uuidParamSchema = z.string().uuid();

/** Returns the id if it's a well-formed UUID, else null — callers respond 400 on null rather than letting a malformed id reach the database. */
export function parseUuidParam(value: string): string | null {
  const result = uuidParamSchema.safeParse(value);
  return result.success ? result.data : null;
}
