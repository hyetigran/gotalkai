import { DEFAULT_STRUCTURE_PRIORITY, getStructureTaxonomyPriority, HERITAGE_STRUCTURE_PRIORITY } from './structure-taxonomy';

describe('getStructureTaxonomyPriority', () => {
  it('partner_learner matches PRD §5.8\'s own order verbatim', () => {
    expect(getStructureTaxonomyPriority('partner_learner')).toEqual([
      'aspect_perfective',
      'verbs_of_motion',
      'stress_placement',
      'register',
      'case_government',
    ]);
  });

  it('heritage_speaker reorders register and case_government to the front — AC #3\'s "adjusted for heritage-speaker-typical gaps"', () => {
    const heritage = getStructureTaxonomyPriority('heritage_speaker');
    expect(heritage[0]).toBe('register');
    expect(heritage[1]).toBe('case_government');
  });

  it('both orders are the same five structures, just reordered — no structure invented or dropped', () => {
    expect([...getStructureTaxonomyPriority('heritage_speaker')].sort()).toEqual([...DEFAULT_STRUCTURE_PRIORITY].sort());
  });

  it('the heritage order is genuinely a different order, not a copy of the default', () => {
    expect(HERITAGE_STRUCTURE_PRIORITY).not.toEqual(DEFAULT_STRUCTURE_PRIORITY);
  });
});
