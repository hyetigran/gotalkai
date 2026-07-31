import { act, renderHook } from '@testing-library/react-native';

/** use-tts-playback.ts's own real-player behavior is covered by use-tts-playback.test.ts; this hook only needs a harmless stand-in so enqueue/stopAndClear don't touch a real native module. */
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
  setAudioModeAsync: jest.fn(),
}));

/**
 * use-tts-playback.ts (via enqueue) now writes each chunk to a real file
 * (docs/adr/0024's on-device fix — see that file's own header comment)
 * instead of a `data:` URI; this hook doesn't care about file contents,
 * only that construction/writing doesn't touch a real native module. Uses
 * plain `function`s (not `class`), which are fully hoisted regardless of
 * their position relative to `jest.mock`'s own hoisting — see
 * use-tts-playback.test.ts's own mock for the longer explanation of why
 * that ordering matters here.
 */
jest.mock('expo-file-system', () => ({
  File: function MockFile() {
    return { uri: 'file:///mock.mp3', exists: true, write: jest.fn(), delete: jest.fn() };
  },
  Directory: function MockDirectory() {
    return { exists: true, create: jest.fn() };
  },
  Paths: { cache: 'mock-cache-dir' },
}));

// eslint-disable-next-line import/first -- must follow jest.mock('expo-audio', ...) above
import { setAudioModeAsync } from 'expo-audio';
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
  (setAudioModeAsync as jest.Mock).mockClear();
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
    // PRD §6.2: "she opens, not the learner" — tells the server it's safe to start her opening line.
    expect(sent).toContainEqual({ type: 'begin_conversation' });
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

  it('replaces the filler with a "system" turn (not "persona") on safety_response — ticket #27\'s escape hatch', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Ну…' }));
    act(() => latestSocket().simulateMessage({ type: 'safety_response', category: 'distress', text: 'Safety text' }));

    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]).toEqual({ speaker: 'system', text: 'Safety text' });
  });

  it('runs the exact same cascade for a typed turn (ticket #32) — filler -> transcript_final -> reply -> tts, through the same reducer', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());

    act(() => result.current.submitText('Привет!'));
    const sent = latestSocket().sent.map(raw => JSON.parse(raw));
    expect(sent).toContainEqual({ type: 'text_input', text: 'Привет!' });

    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Ну…' }));
    act(() => latestSocket().simulateMessage({ type: 'transcript_final', text: 'Привет!' }));
    act(() => latestSocket().simulateMessage({ type: 'persona_turn', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm' }));
    act(() => latestSocket().simulateMessage({ type: 'tts_chunk', sentenceIndex: 0, audioBase64: 'abc' }));

    expect(result.current.phase).toBe('speaking');
    // Matches the voice path's own established behavior (see "runs the full cascade" above): once
    // transcript_final has landed between the filler and the real reply, the filler turn is kept
    // (not replaced) and both the transcript and the real reply append as their own entries.
    expect(result.current.turns).toEqual([
      { speaker: 'persona', text: 'Ну…' },
      { speaker: 'learner', text: 'Привет!' },
      { speaker: 'persona', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm' },
    ]);
  });

  it('defaults to voice mode, and setMode switches it', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    expect(result.current.mode).toBe('voice');

    act(() => result.current.setMode('text'));
    expect(result.current.mode).toBe('text');

    act(() => result.current.setMode('voice'));
    expect(result.current.mode).toBe('voice');
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('useLiveConverseSession audio session (UAT: no audio from the persona)', () => {
  /**
   * use-mic-capture.ts (the scripted-demo path) calls
   * configureConverseAudioSession() before recording, which is what puts
   * expo-audio into `playsInSilentMode: true` — without it, expo-audio's
   * playback session defaults to NOT playing while the device is in silent
   * mode (iOS) / at low media-stream priority (Android), so TTS chunks play
   * into silence. The live pipeline uses native PCM capture instead of
   * useMicCapture, so it never went through that call — this hook must
   * configure the session itself.
   */
  it('configures the audio session for silent-mode playback before the session opens', () => {
    renderHook(() => useLiveConverseSession(OPTIONS));

    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      playsInSilentMode: true,
      allowsRecording: true,
    }));
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('useLiveConverseSession audio send (docs/adr/0023)', () => {
  it('sends audio_chunk over the wire — the send-side counterpart to real mic capture', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());

    act(() => result.current.sendAudioChunk('cGNt', 16000));
    const sent = latestSocket().sent.map(raw => JSON.parse(raw));
    expect(sent).toContainEqual({ type: 'audio_chunk', pcmBase64: 'cGNt', sampleRateHz: 16000 });
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('useLiveConverseSession hold-to-think and lifecycle', () => {
  it('does not have the floor until the first persona activity, per docs/adr/0002', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    expect(result.current.hasFloor).toBe(false);

    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Ну…' }));
    // hasFloor requires holdSeen AND phase === 'listening' — filler just set phase to 'thinking'.
    expect(result.current.hasFloor).toBe(false);

    const timestamps = { t0TurnDetected: 0, t1SttFinal: 1, t2PersonaStart: 2, t3PersonaComplete: 3, t4StressAnnotated: 4, t5FirstAudio: 5 };
    act(() => latestSocket().simulateMessage({ type: 'turn_complete', timestamps }));
    expect(result.current.hasFloor).toBe(true);
  });

  it('does not have the floor while she is speaking (tts audio playing), not just while thinking', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Ну…' }));
    const timestamps = { t0TurnDetected: 0, t1SttFinal: 1, t2PersonaStart: 2, t3PersonaComplete: 3, t4StressAnnotated: 4, t5FirstAudio: 5 };
    act(() => latestSocket().simulateMessage({ type: 'turn_complete', timestamps }));
    expect(result.current.hasFloor).toBe(true); // floor established after her first turn

    act(() => latestSocket().simulateMessage({ type: 'persona_filler', text: 'Сейчас…' }));
    act(() => latestSocket().simulateMessage({ type: 'transcript_final', text: 'Привет' }));
    act(() => latestSocket().simulateMessage({ type: 'persona_turn', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm' }));
    act(() => latestSocket().simulateMessage({ type: 'tts_chunk', sentenceIndex: 0, audioBase64: 'abc' }));
    expect(result.current.phase).toBe('speaking');
    expect(result.current.hasFloor).toBe(false);

    act(() => result.current.holdOn());
    expect(result.current.holding).toBe(false); // holdOn must be a no-op mid-speech
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
