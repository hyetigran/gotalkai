import type { Pool } from 'pg';
import { inspect } from 'node:util';

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
  content: RedactedMemoryContent;
  createdAt: Date;
  lastReferencedAt: Date | null;
};

/**
 * The only query in this ticket's scope against `persona_memories` — it
 * exists so the redaction wrapper above has a real call site proving the
 * table can be read without the raw content ever sitting in a plain
 * string outside this function. The full callback-mechanic feature
 * (writing memories, selecting which to surface) is later ticket work.
 */
export async function getPersonaMemoriesForLearner(pool: Pool, learnerId: string): Promise<PersonaMemoryRow[]> {
  const result = await pool.query<{
    id: string;
    learner_id: string;
    content: string;
    created_at: Date;
    last_referenced_at: Date | null;
  }>(
    'SELECT id, learner_id, content, created_at, last_referenced_at FROM persona_memories WHERE learner_id = $1 ORDER BY created_at ASC',
    [learnerId],
  );
  return result.rows.map(row => ({
    id: row.id,
    learnerId: row.learner_id,
    content: wrapPersonaMemoryContent(row.content),
    createdAt: row.created_at,
    lastReferencedAt: row.last_referenced_at,
  }));
}
