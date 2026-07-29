import { VoiceConnection } from './voice-connection';

/** Minimal fake standing in for RN's WebSocket, exposing hooks the test drives directly. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  headers: Record<string, string> | undefined;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string, _protocols: unknown, options?: { headers?: Record<string, string> }) {
    this.url = url;
    this.headers = options?.headers;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  simulateOpen() {
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.onclose?.();
  }
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

describe('voiceConnection', () => {
  it('sends the bearer token as a header on connect', () => {
    const connection = new VoiceConnection({ url: 'ws://example.test', token: 'secret-token' });
    connection.connect();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.headers).toEqual({ Authorization: 'Bearer secret-token' });
  });

  it('reports state transitions through onStateChange', () => {
    const states: string[] = [];
    const connection = new VoiceConnection({
      url: 'ws://example.test',
      token: 't',
      onStateChange: state => states.push(state),
    });

    connection.connect();
    expect(states).toEqual(['connecting']);

    FakeWebSocket.instances[0]?.simulateOpen();
    expect(states).toEqual(['connecting', 'open']);
  });

  it('resolves ping() when a matching pong arrives', async () => {
    const connection = new VoiceConnection({ url: 'ws://example.test', token: 't' });
    connection.connect();
    FakeWebSocket.instances[0]?.simulateOpen();

    const pingPromise = connection.ping();
    const sentRaw = FakeWebSocket.instances[0]?.sent[0];
    const sent = JSON.parse(sentRaw ?? '{}');
    expect(sent.type).toBe('ping');
    expect(typeof sent.requestId).toBe('string');

    FakeWebSocket.instances[0]?.simulateMessage({ type: 'pong', requestId: sent.requestId, serverTime: 123 });
    await expect(pingPromise).resolves.toEqual({ type: 'pong', requestId: sent.requestId, serverTime: 123 });
  });

  it('rejects ping() if the connection is not open', async () => {
    const connection = new VoiceConnection({ url: 'ws://example.test', token: 't' });
    await expect(connection.ping()).rejects.toThrow('not open');
  });

  it('rejects ping() on timeout without a matching pong', async () => {
    const connection = new VoiceConnection({ url: 'ws://example.test', token: 't' });
    connection.connect();
    FakeWebSocket.instances[0]?.simulateOpen();

    const pingPromise = connection.ping(1000);
    const assertion = expect(pingPromise).rejects.toThrow('timed out');
    jest.advanceTimersByTime(1000);
    await assertion;
  });

  it('rejects a pending ping immediately on unexpected close, rather than waiting out its timeout', async () => {
    const connection = new VoiceConnection({ url: 'ws://example.test', token: 't' });
    connection.connect();
    FakeWebSocket.instances[0]?.simulateOpen();

    const pingPromise = connection.ping(30_000);
    FakeWebSocket.instances[0]?.simulateClose();

    await expect(pingPromise).rejects.toThrow('closed');
  });

  it('reconnects after an unexpected close', () => {
    const connection = new VoiceConnection({ url: 'ws://example.test', token: 't', reconnectDelayMs: 500 });
    connection.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]?.simulateClose();
    jest.advanceTimersByTime(500);

    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('does not reconnect after an explicit disconnect', () => {
    const connection = new VoiceConnection({ url: 'ws://example.test', token: 't', reconnectDelayMs: 500 });
    connection.connect();
    connection.disconnect();
    jest.advanceTimersByTime(5000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

// Sibling describe, not nested inside the block above — keeps each describe
// callback under the max-lines-per-function limit.
describe('voiceConnection pipeline messages (ticket #18)', () => {
  it('sends audio_chunk, hold_start, hold_end, session_start, and text_input with the expected shape', () => {
    const connection = new VoiceConnection({ url: 'ws://example.test', token: 't' });
    connection.connect();
    FakeWebSocket.instances[0]?.simulateOpen();

    connection.sendAudioChunk('AAAA', 16000);
    connection.sendHoldStart();
    connection.sendHoldEnd();
    connection.sendSessionStart('learner-1', 'session-1');
    connection.sendTextInput('Привет!');

    const sent = (FakeWebSocket.instances[0]?.sent ?? []).map(raw => JSON.parse(raw));
    expect(sent).toEqual([
      { type: 'audio_chunk', pcmBase64: 'AAAA', sampleRateHz: 16000 },
      { type: 'hold_start' },
      { type: 'hold_end' },
      { type: 'session_start', learnerId: 'learner-1', sessionId: 'session-1' },
      { type: 'text_input', text: 'Привет!' },
    ]);
  });

  it('silently drops sends while not open, rather than throwing', () => {
    const connection = new VoiceConnection({ url: 'ws://example.test', token: 't' });
    connection.connect();

    expect(() => connection.sendAudioChunk('AAAA', 16000)).not.toThrow();
    expect(FakeWebSocket.instances[0]?.sent).toEqual([]);
  });

  it('forwards pipeline messages to onMessage, typed and excluding pong', () => {
    const received: unknown[] = [];
    const connection = new VoiceConnection({
      url: 'ws://example.test',
      token: 't',
      onMessage: message => received.push(message),
    });
    connection.connect();
    FakeWebSocket.instances[0]?.simulateOpen();

    FakeWebSocket.instances[0]?.simulateMessage({ type: 'pong', requestId: undefined, serverTime: 1 });
    FakeWebSocket.instances[0]?.simulateMessage({ type: 'persona_filler', text: 'Ну…' });
    FakeWebSocket.instances[0]?.simulateMessage({ type: 'barge_in' });

    expect(received).toEqual([
      { type: 'persona_filler', text: 'Ну…' },
      { type: 'barge_in' },
    ]);
  });
});
