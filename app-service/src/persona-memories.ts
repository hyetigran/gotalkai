import type { Pool, PoolClient } from 'pg';
import { inspect } from 'node:util';
import type { PersonaId } from './personas';
import { DEFAULT_PERSONA_ID } from './personas';

const REDACTED = '[REDACTED:persona_memory]';

/**
 * Structural safeguard for PRD §8/§12.2: "`persona_memories` never
 * appears in a log line or trace attribute." That has to hold even when a
 * future call site does something careless like `console.log(row)` or
 * spreads a row into a trace's attributes — a code comment can't stop
 * that, so the value itself resists it: `toString`, `toJSON`, and
 * Node's `util.inspect` (what `console.log` uses internally) all return
 * a fixed redacted marker instead of the real content. `reveal()` is the
 * one explicit, greppable way to get the real string back out, meant to
 * be called only at the point the persona LLM prompt is actually
 * assembled.
 */
export class RedactedMemoryContent {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}

export function wrapPersonaMemoryContent(value: string): RedactedMemoryContent {
  return new RedactedMemoryContent(value);
}

export type PersonaMemoryRow = {
  id: string;
  learnerId: string;
  personaId: PersonaId;
  content: RedactedMemoryContent;
  createdAt: Date;
  lastReferencedAt: Date | null;
};

/**
 * Exists so the redaction wrapper above has a real call site proving the
 * table can be read without the raw content ever sitting in a plain
 * string outside this function.
 *
 * Ticket #34 AC #4 / docs/adr/0023: scoped to one persona — "Елена does
 * not inherit or leak Валентина's memories" means every real read path
 * filters by `persona_id`, not just `learner_id`.
 */
export async function getPersonaMemoriesForLearner(pool: Pool, learnerId: string, personaId: PersonaId = DEFAULT_PERSONA_ID): Promise<PersonaMemoryRow[]> {
  const result = await pool.query<{
    id: string;
    learner_id: string;
    persona_id: PersonaId;
    content: string;
    created_at: Date;
    last_referenced_at: Date | null;
  }>(
    'SELECT id, learner_id, persona_id, content, created_at, last_referenced_at FROM persona_memories WHERE learner_id = $1 AND persona_id = $2 ORDER BY created_at ASC',
    [learnerId, personaId],
  );
  return result.rows.map(row => ({
    id: row.id,
    learnerId: row.learner_id,
    personaId: row.persona_id,
    content: wrapPersonaMemoryContent(row.content),
    createdAt: row.created_at,
    lastReferencedAt: row.last_referenced_at,
  }));
}

/**
 * Writes a memory (ticket #22 AC #1: "persona_memories written
 * during/after real sessions when something memorable happens"). The
 * decision of *what* is memorable — for now, whatever the caller passes
 * as `content` — is deliberately not this function's job: the ticket's
 * own AC says the mechanism "can start simple... and is refined later."
 * Today's caller is a debug harness or a direct API call standing in for
 * the eventual analyser (ticket #14+); this function only owns the
 * write itself being real, not the judgment of what counts.
 *
 * Accepts a `Pool` or a checked-out `PoolClient` so callers that need
 * this write inside a larger transaction (e.g. seeding starter memories
 * alongside the learner row that owns them) can pass their transaction's
 * client instead of a fresh pool connection.
 *
 * `personaId` defaults to Валентина (docs/adr/0023) — every pre-#34
 * caller that never knew personas existed keeps writing exactly what it
 * always wrote.
 */
export async function recordPersonaMemory(pool: Pool | PoolClient, learnerId: string, content: string, personaId: PersonaId = DEFAULT_PERSONA_ID): Promise<string> {
  const result = await pool.query<{ id: string }>(
    'INSERT INTO persona_memories (learner_id, persona_id, content) VALUES ($1, $2, $3) RETURNING id',
    [learnerId, personaId, content],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insert did not return a row');
  return row.id;
}

/**
 * Picks the memory to open tomorrow's session with (ticket #22 AC #2)
 * and marks it referenced so the same memory doesn't repeat every day —
 * least-recently-referenced first, never-referenced (`NULL`) ahead of
 * any that have been used before. Returns null if the learner has no
 * memories at all (shouldn't happen once seeding — AC #3 — runs at
 * learner creation, but the Open screen still needs a defined fallback
 * for it).
 *
 * Returns the raw string, not the redacted wrapper: this function's
 * entire purpose is producing the literal line shown to the learner —
 * the one legitimate reveal site for a callback memory, same as the
 * class's own doc comment describes for the persona-prompt case.
 *
 * Ticket #34 AC #4 / docs/adr/0023: scoped to one persona, defaulting to
 * Валентина — the Open screen's callback line must draw only from
 * whichever persona the learner is about to talk to, never a memory that
 * belongs to a different one.
 */
export async function selectAndMarkCallbackMemory(pool: Pool, learnerId: string, personaId: PersonaId = DEFAULT_PERSONA_ID): Promise<string | null> {
  const result = await pool.query<{ id: string; content: string }>(
    `SELECT id, content FROM persona_memories
     WHERE learner_id = $1 AND persona_id = $2
     ORDER BY last_referenced_at ASC NULLS FIRST, created_at ASC
     LIMIT 1`,
    [learnerId, personaId],
  );
  const row = result.rows[0];
  if (!row)
    return null;
  await pool.query('UPDATE persona_memories SET last_referenced_at = now() WHERE id = $1', [row.id]);
  return row.content;
}
