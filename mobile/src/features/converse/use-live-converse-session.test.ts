import { act, renderHook } from '@testing-library/react-native';

/**
 * `useTurnPersistence` (this hook's own turn-persistence side effect)
 * calls these two react-query-kit mutations, which need a real
 * `QueryClientProvider` ancestor to render at all — out of scope for
 * this file's own tests (they exercise the connection/reducer state
 * machine, not persistence, same reasoning `expo-audio`/`expo-file-system`
 * below are mocked rather than wrapped in a real provider). Dedicated
 * coverage for the persistence side effect itself lives in the
 * "turn persistence" describe block further down, against these same
 * jest.fn() mocks.
 */
jest.mock('./api', () => ({
  useRecordTurn: jest.fn(),
  useMarkTurnRevealed: jest.fn(),
}));

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
 * (docs/adr/0026's on-device fix — see that file's own header comment)
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
// eslint-disable-next-line import/first -- must follow jest.mock('./api', ...) above
import { useMarkTurnRevealed, useRecordTurn } from './api';
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

/** Fires `onSuccess` synchronously with an incrementing fake id, mirroring a resolved `POST /sessions/:id/turns` closely enough for `markRevealed`'s own id-lookup to be exercised without a real network layer. */
let nextFakeTurnId = 0;
const recordTurnMutate = jest.fn((_variables: unknown, options?: { onSuccess?: (result: { id: string }) => void }) => {
  options?.onSuccess?.({ id: `turn-${nextFakeTurnId++}` });
});
const markTurnRevealedMutate = jest.fn();

beforeEach(() => {
  FakeWebSocket.instances = [];
  // @ts-expect-error test double standing in for the ambient WebSocket global
  globalThis.WebSocket = FakeWebSocket;
  jest.useFakeTimers();
  (setAudioModeAsync as jest.Mock).mockClear();
  nextFakeTurnId = 0;
  recordTurnMutate.mockClear();
  markTurnRevealedMutate.mockClear();
  (useRecordTurn as unknown as jest.Mock).mockReturnValue({ mutate: recordTurnMutate });
  (useMarkTurnRevealed as unknown as jest.Mock).mockReturnValue({ mutate: markTurnRevealedMutate });
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
    // UAT: "get rid of [the filler] completely" — no placeholder turn renders for it.
    expect(result.current.turns).toEqual([]);

    act(() => latestSocket().simulateMessage({ type: 'transcript_final', text: 'Привет' }));
    expect(result.current.turns).toEqual([
      { speaker: 'learner', text: 'Привет' },
    ]);

    act(() => latestSocket().simulateMessage({ type: 'persona_turn', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm' }));
    expect(result.current.turns).toEqual([
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

  it('renders no placeholder for the filler — the real reply is the only turn', () => {
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

  it('renders a "system" turn (not "persona"), not a filler placeholder, on safety_response — ticket #27\'s escape hatch', () => {
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
    // Matches the voice path's own established behavior (see "runs the full cascade" above):
    // no placeholder for the filler — just the learner's transcript and the real reply.
    expect(result.current.turns).toEqual([
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
describe('useLiveConverseSession audio send (docs/adr/0026)', () => {
  it('sends audio_chunk over the wire, with the commit flag ticket #40 uses as the turn boundary', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());

    act(() => result.current.sendAudioChunk('cGNt', 16000, false));
    act(() => result.current.sendAudioChunk('', 16000, true));
    const sent = latestSocket().sent.map(raw => JSON.parse(raw));
    expect(sent).toContainEqual({ type: 'audio_chunk', pcmBase64: 'cGNt', sampleRateHz: 16000, commit: false });
    expect(sent).toContainEqual({ type: 'audio_chunk', pcmBase64: '', sampleRateHz: 16000, commit: true });
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('useLiveConverseSession lifecycle', () => {
  it('disconnects the underlying connection on unmount', () => {
    const { unmount } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    const socket = latestSocket();

    unmount();
    expect(socket.closeCallCount).toBe(1);
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('useLiveConverseSession translation (PRD §6.2 tap-to-reveal)', () => {
  it(
    'carries translation through onto the persona turn (UAT: "the text is no longer clickable to show translation. add it back")',
    () => {
      const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
      act(() => latestSocket().simulateOpen());
      act(() => latestSocket().simulateMessage({ type: 'persona_turn', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm', translation: 'Hello!' }));

      expect(result.current.turns).toEqual([
        { speaker: 'persona', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm', translation: 'Hello!' },
      ]);
    },
  );
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('useLiveConverseSession turn persistence (ticket #29 / docs/adr/0022)', () => {
  it('persists a learner turn and a persona turn (with comprehension) as they land, in order', () => {
    renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());

    act(() => latestSocket().simulateMessage({ type: 'transcript_final', text: 'Привет' }));
    act(() => latestSocket().simulateMessage({ type: 'persona_turn', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm' }));

    expect(recordTurnMutate).toHaveBeenNthCalledWith(
      1,
      { sessionId: 'session-1', speaker: 'learner', content: 'Привет', comprehension: undefined },
      expect.anything(),
    );
    expect(recordTurnMutate).toHaveBeenNthCalledWith(
      2,
      { sessionId: 'session-1', speaker: 'persona', content: 'Здравствуй!', comprehension: 'understood' },
      expect.anything(),
    );
  });

  it('never persists a "system" turn — turns.speaker has no matching value for it', () => {
    renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());

    act(() => latestSocket().simulateMessage({ type: 'safety_response', category: 'distress', text: 'Safety text' }));

    expect(recordTurnMutate).not.toHaveBeenCalled();
  });

  it('does not re-persist a turn already sent on an earlier render', () => {
    const { rerender } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    act(() => latestSocket().simulateMessage({ type: 'transcript_final', text: 'Привет' }));
    expect(recordTurnMutate).toHaveBeenCalledTimes(1);

    rerender(undefined);
    expect(recordTurnMutate).toHaveBeenCalledTimes(1);
  });

  it('markRevealed looks up the real turn id from recordTurn\'s own onSuccess and marks it revealed', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());
    act(() => latestSocket().simulateMessage({ type: 'persona_turn', text: 'Здравствуй!', comprehension: 'understood', affect: 'warm' }));

    act(() => result.current.markRevealed(0));

    expect(markTurnRevealedMutate).toHaveBeenCalledWith({ turnId: 'turn-0' });
  });

  it('markRevealed is a no-op for an index whose recordTurn call has not resolved (or does not exist)', () => {
    const { result } = renderHook(() => useLiveConverseSession(OPTIONS));
    act(() => latestSocket().simulateOpen());

    act(() => result.current.markRevealed(0));

    expect(markTurnRevealedMutate).not.toHaveBeenCalled();
  });
});
