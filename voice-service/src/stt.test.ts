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

  it('sends a well-formed input_audio_chunk message', () => {
    const { connect, sent } = fakeConnect();
    const session = createSttSession('test-key', {}, connect);
    session.sendAudioChunk('BASE64AUDIO==', 16000, true);
    expect(JSON.parse(sent[0] as string)).toEqual({
      message_type: 'input_audio_chunk',
      audio_base_64: 'BASE64AUDIO==',
      sample_rate: 16000,
      commit: true,
    });
  });

  it('defaults commit to false when not specified', () => {
    const { connect, sent } = fakeConnect();
    const session = createSttSession('test-key', {}, connect);
    session.sendAudioChunk('BASE64AUDIO==', 16000);
    expect(JSON.parse(sent[0] as string).commit).toBe(false);
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
        message_type: 'final_transcript_with_timestamps',
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

  it('calls onError (does not crash, does not fabricate defaults) when a final_transcript_with_timestamps word is missing required fields', () => {
    const { connect, emit } = fakeConnect();
    const onFinalTranscript = jest.fn();
    const onError = jest.fn();
    createSttSession('test-key', { onFinalTranscript, onError }, connect);
    expect(() => emit('message', JSON.stringify({
      message_type: 'final_transcript_with_timestamps',
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
