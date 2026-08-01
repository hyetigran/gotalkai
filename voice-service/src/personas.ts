import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { buildElenaSystemPrompt, buildValentinaSystemPrompt } from './persona';

/**
 * Ticket #34 / docs/adr/0023: the persona-parameterization machinery —
 * `persona-turn.ts`'s `generatePersonaTurn` and `turn-orchestrator.ts`'s
 * register handling both take a `PersonaDefinition` now instead of being
 * hardcoded to Валентина. Deliberately small: this is a registry of
 * *identity* (system prompt, register), not of vendor config — voice ids
 * are env-var-backed secrets `server.ts` resolves, kept out of this
 * module so it stays pure and testable without touching `process.env`.
 */

export const PERSONA_IDS = ['valentina', 'elena'] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

export type PersonaDefinition = {
  id: PersonaId;
  systemPromptBlocks: TextBlockParam[];
  /** How this persona addresses the learner — PRD §6.4/docs/adr/0023: Валентина's ты, Елена's вы. */
  personaRegister: string;
  /** How the learner addresses this persona. */
  learnerRegister: string;
};

export const PERSONA_DEFINITIONS: Record<PersonaId, PersonaDefinition> = {
  valentina: {
    id: 'valentina',
    systemPromptBlocks: buildValentinaSystemPrompt(),
    personaRegister: 'ty',
    learnerRegister: 'vy',
  },
  elena: {
    id: 'elena',
    systemPromptBlocks: buildElenaSystemPrompt(),
    personaRegister: 'vy',
    learnerRegister: 'vy',
  },
};

/** Валентина — the only persona a new learner ever starts with (PRD §6.4: "shipping one persona"), and every pre-#34 code path's implicit assumption. */
export const DEFAULT_PERSONA_ID: PersonaId = 'valentina';

export function getPersonaDefinition(personaId: PersonaId): PersonaDefinition {
  return PERSONA_DEFINITIONS[personaId];
}
