import type { MinimalWebSocket, SttEventHandlers } from './stt';
import { createSttSession } from './stt';

type Listener = (...args: never[]) => void;

function fakeConnect() {
  const listeners: Partial<Record<string, Listener[]>> = {};
  const sent: string[] = [];
  let closed = false;
  const ws: MinimalWebSocket = {
    on: (event, listener) => {
      (listeners[event] ??= []).push(listener);
    },
    send: (data: string) => sent.push(data),
    close: () => {
      closed = true;
    },
  };
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners[event] ?? []) (listener as (...a: unknown[]) => void)(...args);
  };
  let capturedUrl = '';
  const connect = (url: string) => {
    capturedUrl = url;
    return ws;
  };
  return { connect, emit, sent, get closed() { return closed; }, get capturedUrl() { return capturedUrl; } };
}

describe('createSttSession', () => {
  it('connects with model/language/timestamps query params set (AC #3 depends on include_timestamps for word-level confidence)', () => {
    const fake = fakeConnect();
    createSttSession('test-key', {}, fake.connect);
    const url = new URL(fake.capturedUrl);
    expect(url.searchParams.get('include_timestamps')).toBe('true');
    expect(url.searchParams.get('language_code')).toBe('ru');
    expect(url.searchParams.get('model_id')).toBeTruthy();
  });

  it('sends a well-formed input_audio_chunk message once the socket is open', () => {
    const { connect, emit, sent } = fakeConnect();
    const session = createSttSession('test-key', {}, connect);
    emit('open');
    session.sendAudioChunk('BASE64AUDIO==', 16000, true);
    expect(JSON.parse(sent[0] as string)).toEqual({
      message_type: 'input_audio_chunk',
      audio_base_64: 'BASE64AUDIO==',
      sample_rate: 16000,
      commit: true,
    });
  });

  it('defaults commit to false when not specified', () => {
    const { connect, emit, sent } = fakeConnect();
    const session = createSttSession('test-key', {}, connect);
    emit('open');
    session.sendAudioChunk('BASE64AUDIO==', 16000);
    expect(JSON.parse(sent[0] as string).commit).toBe(false);
  });

  it('does not throw when sendAudioChunk is called before the socket has opened — the real-world race turn-orchestrator.ts hits on every utterance (createSttSession and the first sendAudioChunk happen in the same synchronous tick, before ws\'s handshake to ElevenLabs can possibly have completed)', () => {
    const { connect, sent } = fakeConnect();
    const session = createSttSession('test-key', {}, connect);
    expect(() => session.sendAudioChunk('BASE64AUDIO==', 16000)).not.toThrow();
    expect(sent).toHaveLength(0); // buffered, not sent yet — the socket isn't open
  });

  it('flushes chunks buffered before open, in order, once the socket opens', () => {
    const { connect, emit, sent } = fakeConnect();
    const session = createSttSession('test-key', {}, connect);
    session.sendAudioChunk('FIRST==', 16000);
    session.sendAudioChunk('SECOND==', 16000, true);
    expect(sent).toHaveLength(0);

    emit('open');

    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0] as string).audio_base_64).toBe('FIRST==');
    expect(JSON.parse(sent[1] as string).audio_base_64).toBe('SECOND==');

    // Chunks sent after open still go straight through, not re-buffered.
    session.sendAudioChunk('THIRD==', 16000);
    expect(sent).toHaveLength(3);
  });

  it('calls onPartialTranscript for a partial_transcript message', () => {
    const { connect, emit } = fakeConnect();
    const onPartialTranscript = jest.fn();
    createSttSession('test-key', { onPartialTranscript }, connect);
    emit('message', JSON.stringify({ message_type: 'partial_transcript', text: 'она забы' }));
    expect(onPartialTranscript).toHaveBeenCalledWith('она забы');
  });

  it(
    'calls onFinalTranscript with word-level logprob (confidence), not collapsed to a top-1 string (AC #3)',
    () => {
      const { connect, emit } = fakeConnect();
      const onFinalTranscript = jest.fn();
      createSttSession('test-key', { onFinalTranscript }, connect);
      emit('message', JSON.stringify({
        message_type: 'committed_transcript_with_timestamps',
        text: 'она забыла купить билеты',
        language_code: 'ru',
        words: [
          { text: 'она', start: 0, end: 0.3, type: 'word', logprob: -0.02 },
          { text: 'забыла', start: 0.3, end: 0.8, type: 'word', logprob: -1.8 },
        ],
      }));
      expect(onFinalTranscript).toHaveBeenCalledWith({
        text: 'она забыла купить билеты',
        languageCode: 'ru',
        words: [
          { text: 'она', start: 0, end: 0.3, type: 'word', logprob: -0.02 },
          { text: 'забыла', start: 0.3, end: 0.8, type: 'word', logprob: -1.8 },
        ],
      });
    },
  );

  it(
    'calls onFinalTranscript for the real vendor payload shape — message_type "committed_transcript_with_timestamps" (not "final_transcript_with_timestamps", which this file assumed and the vendor has never actually sent), language_code/words sent as explicit null rather than omitted, and extra per-word fields (speaker_id, characters, channel_index) this codebase doesn\'t use — a real regression this exact shape caused: the old case label meant every real transcript fell through to the unhandled default case, and even after fixing the label, `.optional()` doesn\'t accept explicit null, so it still failed to parse (UAT: "app seems to be in a stuck state")',
    () => {
      const { connect, emit } = fakeConnect();
      const onFinalTranscript = jest.fn();
      const onError = jest.fn();
      createSttSession('test-key', { onFinalTranscript, onError }, connect);
      emit('message', JSON.stringify({
        message_type: 'committed_transcript_with_timestamps',
        text: 'Нет.',
        language_code: null,
        words: [
          {
            text: 'Нет.',
            start: 8.64,
            end: 9.059,
            type: 'word',
            speaker_id: null,
            logprob: -3.599609375,
            characters: [{ text: 'Н', start: 8.64, end: 8.719 }],
            channel_index: null,
          },
        ],
      }));
      expect(onError).not.toHaveBeenCalled();
      expect(onFinalTranscript).toHaveBeenCalledWith({
        text: 'Нет.',
        languageCode: undefined,
        words: [
          expect.objectContaining({ text: 'Нет.', start: 8.64, end: 9.059, type: 'word', logprob: -3.599609375 }),
        ],
      });
    },
  );

  it('calls onFinalTranscript with an empty words array for the real vendor payload shape where words is explicit null, not merely omitted', () => {
    const { connect, emit } = fakeConnect();
    const onFinalTranscript = jest.fn();
    createSttSession('test-key', { onFinalTranscript }, connect);
    emit('message', JSON.stringify({ message_type: 'committed_transcript_with_timestamps', text: '', language_code: null, words: null }));
    expect(onFinalTranscript).toHaveBeenCalledWith({ text: '', languageCode: undefined, words: [] });
  });

  it('calls onFinalTranscript for the real vendor payload shape — message_type "committed_transcript" (not "final_transcript"), no timestamps configured', () => {
    const { connect, emit } = fakeConnect();
    const onFinalTranscript = jest.fn();
    createSttSession('test-key', { onFinalTranscript }, connect);
    emit('message', JSON.stringify({ message_type: 'committed_transcript', text: 'Алло!' }));
    expect(onFinalTranscript).toHaveBeenCalledWith({ text: 'Алло!', words: [] });
  });

  it('does not call any handler for a session_started message', () => {
    const { connect, emit } = fakeConnect();
    const handlers: SttEventHandlers = { onPartialTranscript: jest.fn(), onFinalTranscript: jest.fn(), onError: jest.fn() };
    createSttSession('test-key', handlers, connect);
    emit('message', JSON.stringify({ message_type: 'session_started', session_id: 'abc', config: {} }));
    expect(handlers.onPartialTranscript).not.toHaveBeenCalled();
    expect(handlers.onFinalTranscript).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('calls onError with the server-provided message for an error-type message', () => {
    const { connect, emit } = fakeConnect();
    const onError = jest.fn();
    createSttSession('test-key', { onError }, connect);
    emit('message', JSON.stringify({ message_type: 'auth_error', error: 'invalid API key' }));
    expect(onError).toHaveBeenCalledWith(new Error('invalid API key'));
  });

  it(
    'calls onError for a real vendor rejection whose message_type doesn\'t contain the word "error" — a real ElevenLabs response this hook silently swallowed until fixed (an invalid model_id, sent as message_type "invalid_request")',
    () => {
      const { connect, emit } = fakeConnect();
      const onError = jest.fn();
      createSttSession('test-key', { onError }, connect);
      emit('message', JSON.stringify({ message_type: 'invalid_request', error: 'The model_id \'scribe_v2\' is invalid.' }));
      expect(onError).toHaveBeenCalledWith(new Error('The model_id \'scribe_v2\' is invalid.'));
    },
  );

  it('does not call onError for an unrecognized message_type that carries no error field — a genuinely benign, unhandled message type', () => {
    const { connect, emit } = fakeConnect();
    const onError = jest.fn();
    createSttSession('test-key', { onError }, connect);
    emit('message', JSON.stringify({ message_type: 'committed_transcript_something' }));
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError (does not crash) on malformed JSON', () => {
    const { connect, emit } = fakeConnect();
    const onError = jest.fn();
    createSttSession('test-key', { onError }, connect);
    expect(() => emit('message', 'not valid json')).not.toThrow();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('calls onError (does not crash) for well-formed JSON that lacks a message_type at all — the untrusted-boundary Zod check, not just a JSON.parse check', () => {
    const { connect, emit } = fakeConnect();
    const onError = jest.fn();
    createSttSession('test-key', { onError }, connect);
    expect(() => emit('message', JSON.stringify({ text: 'no type field here' }))).not.toThrow();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('calls onError (does not crash, does not fabricate defaults) when a committed_transcript_with_timestamps word is missing required fields', () => {
    const { connect, emit } = fakeConnect();
    const onFinalTranscript = jest.fn();
    const onError = jest.fn();
    createSttSession('test-key', { onFinalTranscript, onError }, connect);
    expect(() => emit('message', JSON.stringify({
      message_type: 'committed_transcript_with_timestamps',
      text: 'она забыла',
      words: [{ text: 'она' }], // missing required `type`/`logprob`
    }))).not.toThrow();
    expect(onFinalTranscript).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('calls onError for a raw websocket error event', () => {
    const { connect, emit } = fakeConnect();
    const onError = jest.fn();
    createSttSession('test-key', { onError }, connect);
    emit('error', new Error('connection reset'));
    expect(onError).toHaveBeenCalledWith(new Error('connection reset'));
  });

  it('closes the underlying connection on close()', () => {
    const fake = fakeConnect();
    const session = createSttSession('test-key', {}, fake.connect);
    session.close();
    expect(fake.closed).toBe(true);
  });
});
