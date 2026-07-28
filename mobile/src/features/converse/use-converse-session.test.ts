import { act, renderHook } from '@testing-library/react-native';

import { CONVERSE_SCRIPT } from './scripted-demo-script';
import { useConverseSession } from './use-converse-session';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useConverseSession turn-taking cadence', () => {
  it('starts idle with her opening line already shown and the hold button hidden', () => {
    const { result } = renderHook(() => useConverseSession());

    expect(result.current.phase).toBe('idle');
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]?.who).toBe('her');
    expect(result.current.holdSeen).toBe(false);
    expect(result.current.chipsVisible).toBe(true);
  });

  it('advances through listening then thinking before revealing her next line, per the mockup cadence', () => {
    const { result } = renderHook(() => useConverseSession());

    act(() => result.current.speak());
    expect(result.current.phase).toBe('listening');
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.holdSeen).toBe(true);

    act(() => jest.advanceTimersByTime(1150));
    expect(result.current.phase).toBe('thinking');
    expect(result.current.turns).toHaveLength(2);
    expect(result.current.turns[1]?.who).toBe('you');

    act(() => jest.advanceTimersByTime(1100));
    expect(result.current.phase).toBe('idle');
    expect(result.current.turns).toHaveLength(3);
    expect(result.current.turns[2]?.who).toBe('her');
  });

  it('ignores speak while not idle or while holding', () => {
    const { result } = renderHook(() => useConverseSession());

    act(() => result.current.speak());
    const turnsAfterFirstSpeak = result.current.turns.length;

    act(() => result.current.speak());
    expect(result.current.turns).toHaveLength(turnsAfterFirstSpeak);

    act(() => jest.advanceTimersByTime(1150 + 1100));
    act(() => result.current.holdOn());
    act(() => result.current.speak());
    expect(result.current.phase).not.toBe('listening');
  });

  it('hides chips once the script is exhausted', () => {
    const { result } = renderHook(() => useConverseSession());

    for (let i = 0; i < CONVERSE_SCRIPT.length; i += 1) {
      act(() => result.current.speak());
      act(() => jest.advanceTimersByTime(1150 + 1100));
    }

    expect(result.current.turns).toHaveLength(CONVERSE_SCRIPT.length);
    expect(result.current.chipsVisible).toBe(false);
    expect(result.current.scriptExhausted).toBe(true);
  });
});

describe('useConverseSession hold-to-think', () => {
  it('is a no-op during her scripted turn, per ADR-0002 (no floor)', () => {
    const { result } = renderHook(() => useConverseSession());

    act(() => result.current.speak());
    act(() => jest.advanceTimersByTime(1150));
    expect(result.current.phase).toBe('thinking');

    act(() => result.current.holdOn());
    expect(result.current.holding).toBe(false);

    act(() => jest.advanceTimersByTime(1100));
    expect(result.current.phase).toBe('idle');
  });

  it('is a no-op immediately after her opening line, before the learner has ever spoken, per ADR-0002', () => {
    const { result } = renderHook(() => useConverseSession());

    expect(result.current.phase).toBe('idle');
    expect(result.current.hasFloor).toBe(false);

    act(() => result.current.holdOn());
    expect(result.current.holding).toBe(false);
  });

  it('suspends the in-flight turn timer while held and resumes the remainder on release', () => {
    const { result } = renderHook(() => useConverseSession());

    act(() => result.current.speak());
    act(() => jest.advanceTimersByTime(600));
    act(() => result.current.holdOn());
    expect(result.current.holding).toBe(true);

    act(() => jest.advanceTimersByTime(10_000));
    expect(result.current.phase).toBe('listening');
    expect(result.current.turns).toHaveLength(1);

    act(() => result.current.holdOff());
    expect(result.current.holding).toBe(false);
    expect(result.current.phase).toBe('listening');

    act(() => jest.advanceTimersByTime(549));
    expect(result.current.phase).toBe('listening');

    act(() => jest.advanceTimersByTime(1));
    expect(result.current.phase).toBe('thinking');
    expect(result.current.turns).toHaveLength(2);
  });

  it('auto-releases a hold after ~45s so the session cannot be hung', () => {
    const { result } = renderHook(() => useConverseSession());

    act(() => result.current.speak());
    act(() => result.current.holdOn());
    expect(result.current.holding).toBe(true);

    act(() => jest.advanceTimersByTime(45_000));
    expect(result.current.holding).toBe(false);
  });

  it('hides suggestion chips during listening, thinking, and holding', () => {
    const { result } = renderHook(() => useConverseSession());

    act(() => result.current.speak());
    expect(result.current.chipsVisible).toBe(false);

    act(() => jest.advanceTimersByTime(1150));
    expect(result.current.chipsVisible).toBe(false);

    act(() => jest.advanceTimersByTime(1100));
    expect(result.current.chipsVisible).toBe(true);

    act(() => result.current.holdOn());
    expect(result.current.chipsVisible).toBe(false);
  });
});

describe('useConverseSession tap to reveal', () => {
  it('toggles per-turn reveal state independently', () => {
    const { result } = renderHook(() => useConverseSession());

    expect(result.current.revealed[0]).toBeFalsy();
    act(() => result.current.toggleReveal(0));
    expect(result.current.revealed[0]).toBe(true);
    act(() => result.current.toggleReveal(0));
    expect(result.current.revealed[0]).toBe(false);
  });
});
