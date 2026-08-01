import { derivePatternTitle, mapDebriefItemToPattern } from './map-debrief-item';

describe('derivePatternTitle', () => {
  it('prefers detail.title when present', () => {
    expect(derivePatternTitle('grammar_error', { title: 'Мы иска́ли, not мы и́щем.' })).toBe('Мы иска́ли, not мы и́щем.');
  });

  it('falls back to structureKey, then kind', () => {
    expect(derivePatternTitle('grammar_error', { structureKey: 'genitive_plural' })).toBe('genitive_plural');
    expect(derivePatternTitle('stress_error', {})).toBe('stress_error');
  });
});

describe('mapDebriefItemToPattern', () => {
  it('uses title/body/tag from detail when present', () => {
    const pattern = mapDebriefItemToPattern({
      rank: 0,
      observationId: 'obs-1',
      kind: 'grammar_error',
      detail: { title: 'Мы иска́ли, not мы и́щем.', body: 'Past narration came up four times.', tag: 'impeded communication · 2×' },
    });
    expect(pattern).toEqual({
      index: '01',
      title: 'Мы иска́ли, not мы и́щем.',
      body: 'Past narration came up four times.',
      tag: 'impeded communication · 2×',
    });
  });

  it('falls back to structureKey for title and derives a tag from impeded when detail lacks copy', () => {
    const pattern = mapDebriefItemToPattern({
      rank: 1,
      observationId: 'obs-2',
      kind: 'grammar_error',
      detail: { structureKey: 'genitive_plural', impeded: true },
    });
    expect(pattern.index).toBe('02');
    expect(pattern.title).toBe('genitive_plural');
    expect(pattern.body).toBe('');
    expect(pattern.tag).toBe('impeded communication');
  });

  it('falls back to kind for title and a null tag when there is no structureKey or impeded flag', () => {
    const pattern = mapDebriefItemToPattern({
      rank: 2,
      observationId: 'obs-3',
      kind: 'stress_error',
      detail: {},
    });
    expect(pattern.index).toBe('03');
    expect(pattern.title).toBe('stress_error');
    expect(pattern.tag).toBeNull();
  });
});
