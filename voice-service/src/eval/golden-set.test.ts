import { GOLDEN_SET } from './golden-set';

describe('GOLDEN_SET', () => {
  it('has at least the frozen 22 entries (PRD §10) — append-only means this count can only grow', () => {
    expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(22);
  });

  it('has a unique, non-empty id for every entry', () => {
    const ids = GOLDEN_SET.map(entry => entry.id);
    expect(ids.every(id => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a non-empty learnerTurn and at least the opening persona turn in history for every entry', () => {
    for (const entry of GOLDEN_SET) {
      expect(entry.learnerTurn.length).toBeGreaterThan(0);
      expect(entry.history.length).toBeGreaterThan(0);
    }
  });

  it('every entry with shouldRecast:true declares an erroneousSpan (no_missed_recast has nothing to check otherwise)', () => {
    for (const entry of GOLDEN_SET.filter(e => e.shouldRecast)) {
      expect(entry.erroneousSpan).toBeTruthy();
    }
  });

  it('includes real negative examples — at least one clean (shouldRecast:false, no structureKey) entry, not only planted errors (no_false_recast needs something to reject)', () => {
    const cleanEntries = GOLDEN_SET.filter(entry => !entry.shouldRecast && !entry.structureKey);
    expect(cleanEntries.length).toBeGreaterThanOrEqual(3);
  });

  // Deliberately NOT a claim of full PRD §5.8 coverage — stress placement
  // (§5.8 priority #3) is structurally out of scope for a text-only
  // harness (see docs/adr/0012's explicit disclosure of why), so this
  // only asserts the four §5.8 structures actually covered, plus the one
  // additional category (gender agreement, not in §5.8) also seeded.
  it('covers four of PRD §5.8\'s five priority structures (all but stress placement — see docs/adr/0012) plus gender agreement', () => {
    const structureKeys = new Set(GOLDEN_SET.map(entry => entry.structureKey).filter(Boolean));
    expect(structureKeys).toContain('aspect_perfective');
    expect(structureKeys).toContain('verbs_of_motion');
    expect(structureKeys).toContain('case_government');
    expect(structureKeys).toContain('register');
    expect(structureKeys).toContain('gender_agreement');
    expect(structureKeys).not.toContain('stress_placement');
  });

  it('includes drift cases (PRD §10: "instruction decay at turn 40") with genuinely long history', () => {
    const driftEntries = GOLDEN_SET.filter(entry => entry.isDriftCase);
    expect(driftEntries.length).toBeGreaterThanOrEqual(1);
    for (const entry of driftEntries) {
      expect(entry.history.length).toBeGreaterThan(30);
    }
  });
});
