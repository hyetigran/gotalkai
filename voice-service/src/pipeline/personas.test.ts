import { DEFAULT_PERSONA_ID, getPersonaDefinition, PERSONA_DEFINITIONS, PERSONA_IDS } from './personas';

describe('PERSONA_DEFINITIONS', () => {
  it('has an entry for every declared PersonaId, keyed consistently', () => {
    for (const id of PERSONA_IDS) {
      expect(PERSONA_DEFINITIONS[id].id).toBe(id);
    }
  });

  it('gives each persona a non-empty, cache-marked system prompt', () => {
    for (const id of PERSONA_IDS) {
      const blocks = PERSONA_DEFINITIONS[id].systemPromptBlocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.cache_control).toEqual({ type: 'ephemeral' });
      expect((blocks[0] as { text: string }).text.length).toBeGreaterThan(0);
    }
  });

  it('encodes Валентина\'s asymmetric register (she ты, learner вы) — PRD §6.4', () => {
    expect(PERSONA_DEFINITIONS.valentina.personaRegister).toBe('ty');
    expect(PERSONA_DEFINITIONS.valentina.learnerRegister).toBe('vy');
  });

  it('encodes Елена\'s mutual вы register, distinct from Валентина\'s — docs/adr/0023', () => {
    expect(PERSONA_DEFINITIONS.elena.personaRegister).toBe('vy');
    expect(PERSONA_DEFINITIONS.elena.learnerRegister).toBe('vy');
  });
});

describe('DEFAULT_PERSONA_ID', () => {
  it('is Валентина — the only persona a new learner ever starts with', () => {
    expect(DEFAULT_PERSONA_ID).toBe('valentina');
  });
});

describe('getPersonaDefinition', () => {
  it('returns the matching definition for a given id', () => {
    expect(getPersonaDefinition('elena').id).toBe('elena');
  });
});
