import { realParamsOrBarePath } from './loop-nav-params';

describe('realParamsOrBarePath', () => {
  it('returns the bare path when no real ids are present', () => {
    expect(realParamsOrBarePath('/debrief', {})).toBe('/debrief');
    expect(realParamsOrBarePath('/debrief', { sessionId: undefined, learnerId: undefined })).toBe('/debrief');
  });

  it('includes only the ids that are actually present', () => {
    expect(realParamsOrBarePath('/debrief', { sessionId: 'session-1' })).toEqual({
      pathname: '/debrief',
      params: { sessionId: 'session-1' },
    });
    expect(realParamsOrBarePath('/open', { learnerId: 'learner-1' })).toEqual({
      pathname: '/open',
      params: { learnerId: 'learner-1' },
    });
  });

  it('includes both ids when both are present', () => {
    expect(realParamsOrBarePath('/tomorrow', { sessionId: 'session-1', learnerId: 'learner-1' })).toEqual({
      pathname: '/tomorrow',
      params: { sessionId: 'session-1', learnerId: 'learner-1' },
    });
  });
});
