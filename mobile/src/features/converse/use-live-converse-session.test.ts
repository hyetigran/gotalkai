import { act, renderHook } from '@testing-library/react-native';

/** use-tts-playback.ts's own real-player behavior is covered by use-tts-playback.test.ts; this hook only needs a harmless stand-in so enqueue/stopAndClear don't touch a real native module. */
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
}));

// eslint-disable-next-line import/first -- must follow jest.mock('expo-audio', ...) above
import { useLiveConverseSession } from './use-live-converse-session';

/** Minimal fake standing in for RN's WebSocket — mirrors voice-connection.test.ts's fake, since VoiceConnection is exercised for real (not mocked) by this hook. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: string[] = [];
  closeCallCount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(_url: string, _protocols: unknown, _options?: unknown) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closeCallCount += 1;
    this.onclose?.();
  }

  simulateOpen() {
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!socket)
    throw new Error('no FakeWebSocket instance created');
  return socket;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  // @ts-expect-error test double standing in for the ambient WebSocket global
  globalThis.WebSocket = FakeWebSocket;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const OPTIONS = { url: 'ws://example.test', token: 't', learnerId: 'learner-1', sessionId: 'session-1' };

describe('useLiveConverseSession', () => {
  it('starts connecting, then sends session_start once the socket opens', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    expect(result.current.phase).toBe('connecting');

    act(() => latestSocket().simulateOpen());

    expect(result.current.phase).toBe('listening');
    const sent = latestSocket().sent.map(raw => JSON.parse(raw));
    expect(sent).toContainEqual({ type: 'session_start', learnerId: 'learner-1', sessionId: 'session-1' });
  });

  it('runs the full cascade through phase and turns: filler -> transcript -> reply -> tts -> turn_complete', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());

    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Ну…' }));
    expect(result.current.phase).toBe('thinking');
    expect(result.current.holdSeen).toBe(true);
    expect(result.current.turns).toEqual([{ speaker: 'persona', text: 'Ну…' }]);

    act(() => latestSocket().simulateMessage({ type: 'transcript_final', text: 'Привет' }));
    expect(result.current.turns).toEqual([
      { speaker: 'persona', text: 'Ну…' },
      { speaker: 'learner', text: 'Привет' },
    ]);

    act(() => latestSocket().simulateMessage({ type: 'persona_turn', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm' }));
    expect(result.current.turns).toEqual([
      { speaker: 'persona', text: 'Ну…' },
      { speaker: 'learner', text: 'Привет' },
      { speaker: 'persona', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm' },
    ]);

    act(() => latestSocket().simulateMessage({ type: 'tts_chunk', sentenceIndex: 0, audioBase64: 'abc' }));
    expect(result.current.phase).toBe('speaking');

    const timestamps = { t0TurnDetected: 0, t1SttFinal: 1, t2PersonaStart: 2, t3PersonaComplete: 3, t4StressAnnotated: 4, t5FirstAudio: 5 };
    act(() => latestSocket().simulateMessage({ type: 'turn_complete', timestamps }));
    expect(result.current.phase).toBe('listening');
    expect(result.current.lastTimestamps).toEqual(timestamps);
  });

  it('replaces the filler turn with the real reply rather than appending a second persona turn', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Ну…' }));
    act(() => latestSocket().simulateMessage({ type: 'persona_turn', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm' }));

    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]?.text).toBe('Здравствуй!');
  });

  it('resets to listening on barge_in', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Ну…' }));
    expect(result.current.phase).toBe('thinking');

    act(() => latestSocket().simulateMessage({ type: 'barge_in' }));
    expect(result.current.phase).toBe('listening');
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('useLiveConverseSession hold-to-think and lifecycle', () => {
  it('does not have the floor until the first persona activity, per docs/adr/0002', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    expect(result.current.hasFloor).toBe(false);

    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Ну…' }));
    // hasFloor requires holdSeen AND phase !== 'thinking' — filler just set phase to 'thinking'.
    expect(result.current.hasFloor).toBe(false);

    const timestamps = { t0TurnDetected: 0, t1SttFinal: 1, t2PersonaStart: 2, t3PersonaComplete: 3, t4StressAnnotated: 4, t5FirstAudio: 5 };
    act(() => latestSocket().simulateMessage({ type: 'turn_complete', timestamps }));
    expect(result.current.hasFloor).toBe(true);
  });

  it('sends hold_start/hold_end over the wire and auto-releases after 45s', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Ну…' }));
    const timestamps = { t0TurnDetected: 0, t1SttFinal: 1, t2PersonaStart: 2, t3PersonaComplete: 3, t4StressAnnotated: 4, t5FirstAudio: 5 };
    act(() => latestSocket().simulateMessage({ type: 'turn_complete', timestamps }));
    expect(result.current.hasFloor).toBe(true);

    act(() => result.current.holdOn());
    expect(result.current.holding).toBe(true);
    const sentAfterHoldOn = latestSocket().sent.map(raw => JSON.parse(raw));
    expect(sentAfterHoldOn).toContainEqual({ type: 'hold_start' });

    act(() => jest.advanceTimersByTime(45_000));
    expect(result.current.holding).toBe(false);
    const sentAfterAutoRelease = latestSocket().sent.map(raw => JSON.parse(raw));
    expect(sentAfterAutoRelease).toContainEqual({ type: 'hold_end' });
  });

  it('ignores holdOn without the floor', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());

    act(() => result.current.holdOn());
    expect(result.current.holding).toBe(false);
  });

  it('disconnects the underlying connection on unmount', () => {
    const { unmount } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    const socket = latestSocket();

    unmount();
    expect(socket.closeCallCount).toBe(1);
  });
});
