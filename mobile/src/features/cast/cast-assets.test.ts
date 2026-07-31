import { expressionForPhase } from './cast-assets';

describe('expressionForPhase', () => {
  it('maps thinking / speaking / listening phases directly', () => {
    expect(expressionForPhase('thinking')).toBe('thinking');
    expect(expressionForPhase('speaking')).toBe('speaking');
    expect(expressionForPhase('listening')).toBe('listening');
  });

  it('treats idle after her/persona turn as speaking for the scripted demo', () => {
    expect(expressionForPhase('idle', { lastSpeaker: 'her' })).toBe('speaking');
    expect(expressionForPhase('idle', { lastSpeaker: 'persona' })).toBe('speaking');
  });

  it('defaults idle without a persona last speaker to idle', () => {
    expect(expressionForPhase('idle')).toBe('idle');
    expect(expressionForPhase('idle', { lastSpeaker: 'you' })).toBe('idle');
    expect(expressionForPhase('connecting')).toBe('idle');
  });

  it('lets comprehension and affect override phase', () => {
    expect(expressionForPhase('listening', { comprehension: 'not_understood' })).toBe('surprised');
    expect(expressionForPhase('speaking', { affect: 'warm' })).toBe('smile');
  });
});
