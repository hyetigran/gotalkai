import type { Env } from './env';
import WebSocket from 'ws';
import { startServer } from './server';

const AUTH_TOKEN = 'test-token-0123456789abcdef';

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 0, // ask the OS for a free port
    NODE_ENV: 'test',
    VOICE_SERVICE_AUTH_TOKEN: AUTH_TOKEN,
    ANTHROPIC_API_KEY: 'sk-ant-test-key',
    ELEVENLABS_API_KEY: 'el-test-key',
    ELEVENLABS_VALENTINA_VOICE_ID: 'voice-test-id',
    APP_SERVICE_URL: 'http://127.0.0.1:1', // deliberately unreachable — recording failures must not affect the live pipeline (ticket #29)
    ...overrides,
  };
}

function connect(port: number, token?: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function once<T = unknown>(ws: WebSocket, event: 'open' | 'message' | 'close' | 'error'): Promise<T> {
  return new Promise((resolve) => {
    ws.once(event, (data: unknown) => resolve(data as T));
  });
}

/** A rejected handshake (server responds but not with a 101 upgrade) is `ws`'s own `unexpected-response` event, not `close`/`error`. */
function expectHandshakeRejection(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
  });
}

describe('voice service server', () => {
  it('rejects an upgrade with no Authorization header', async () => {
    const handle = await startServer(testEnv());
    const ws = connect(handle.port);
    const statusCode = await expectHandshakeRejection(ws);
    expect(statusCode).toBe(401);
    await handle.close();
  });

  it('rejects an upgrade with the wrong token', async () => {
    const handle = await startServer(testEnv());
    const ws = connect(handle.port, 'wrong-token');
    const statusCode = await expectHandshakeRejection(ws);
    expect(statusCode).toBe(401);
    await handle.close();
  });

  it('accepts an upgrade with the correct bearer token and completes a ping/pong round trip', async () => {
    const handle = await startServer(testEnv());
    const ws = connect(handle.port, AUTH_TOKEN);
    await once(ws, 'open');

    ws.send(JSON.stringify({ type: 'ping', requestId: 'abc-123' }));
    const raw = await once<Buffer>(ws, 'message');
    const response = JSON.parse(raw.toString());

    expect(response.type).toBe('pong');
    expect(response.requestId).toBe('abc-123');
    expect(typeof response.serverTime).toBe('number');

    ws.close();
    await handle.close();
  });

  it('responds with an error message for malformed JSON instead of dropping the connection', async () => {
    const handle = await startServer(testEnv());
    const ws = connect(handle.port, AUTH_TOKEN);
    await once(ws, 'open');

    ws.send('not json');
    const raw = await once<Buffer>(ws, 'message');
    const response = JSON.parse(raw.toString());

    expect(response.type).toBe('error');

    ws.close();
    await handle.close();
  });

  it('responds with an error message for a well-formed but unrecognized message', async () => {
    const handle = await startServer(testEnv());
    const ws = connect(handle.port, AUTH_TOKEN);
    await once(ws, 'open');

    ws.send(JSON.stringify({ type: 'not-a-real-type' }));
    const raw = await once<Buffer>(ws, 'message');
    const response = JSON.parse(raw.toString());

    expect(response.type).toBe('error');

    ws.close();
    await handle.close();
  });

  it('terminates open client connections on close, so a restart does not leave clients hanging indefinitely', async () => {
    const handle = await startServer(testEnv());
    const ws = connect(handle.port, AUTH_TOKEN);
    await once(ws, 'open');

    await handle.close();
    const closeEvent = await once<{ code: number }>(ws, 'close');
    expect(closeEvent).toBeDefined();
  });

  describe('pipeline messages (ticket #18)', () => {
    /** Sends `type: 'ping'` and awaits the matching pong — a clean way to prove the connection is still alive/responsive after some other message, without an arbitrary timeout. */
    async function assertStillResponsive(ws: WebSocket): Promise<void> {
      ws.send(JSON.stringify({ type: 'ping', requestId: 'still-alive' }));
      const raw = await once<Buffer>(ws, 'message');
      const response = JSON.parse(raw.toString());
      expect(response).toMatchObject({ type: 'pong', requestId: 'still-alive' });
    }

    // Silent (all-zero) PCM — VadGate never reaches 'speech', so no STT
    // session opens and no real network call to ElevenLabs/Anthropic is
    // attempted. Real-pipeline behavior (loud audio, a full turn) is
    // exercised in turn-orchestrator.test.ts against fakes; this suite
    // only proves server.ts's message routing itself doesn't crash —
    // this environment has no real vendor credentials to test the full
    // path end to end (docs/adr/0017).
    function silentAudioChunkMessage(): string {
      const silentSamples = new Int16Array(160); // all zeros
      const pcmBase64 = Buffer.from(silentSamples.buffer).toString('base64');
      return JSON.stringify({ type: 'audio_chunk', pcmBase64, sampleRateHz: 8000 });
    }

    it('accepts a well-formed audio_chunk message without erroring or crashing the connection', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(silentAudioChunkMessage());
      await assertStillResponsive(ws);

      ws.close();
      await handle.close();
    });

    it('rejects a malformed audio_chunk (missing sampleRateHz) the same way as any other unrecognized message', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'audio_chunk', pcmBase64: 'AAAA' }));
      const raw = await once<Buffer>(ws, 'message');
      expect(JSON.parse(raw.toString())).toMatchObject({ type: 'error' });

      ws.close();
      await handle.close();
    });

    it('accepts hold_start/hold_end without erroring, and audio sent while held produces no response at all', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'hold_start' }));
      ws.send(silentAudioChunkMessage());
      ws.send(JSON.stringify({ type: 'hold_end' }));
      await assertStillResponsive(ws);

      ws.close();
      await handle.close();
    });

    it('accepts a well-formed session_start message without erroring', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'session_start', learnerId: '5c86bf64-d8fa-4b35-8f17-8f797a5cad38', sessionId: '57d4a515-fe86-450e-82c9-8dd710824c3f' }));
      await assertStillResponsive(ws);

      ws.close();
      await handle.close();
    });

    it('rejects a session_start with a malformed (non-UUID) learnerId', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'session_start', learnerId: 'not-a-uuid', sessionId: '57d4a515-fe86-450e-82c9-8dd710824c3f' }));
      const raw = await once<Buffer>(ws, 'message');
      expect(JSON.parse(raw.toString())).toMatchObject({ type: 'error' });

      ws.close();
      await handle.close();
    });

    it('ticket #34: accepts a session_start naming a configured second persona without erroring', async () => {
      const handle = await startServer(testEnv({ ELEVENLABS_ELENA_VOICE_ID: 'elena-voice-test-id' }));
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'session_start', learnerId: '5c86bf64-d8fa-4b35-8f17-8f797a5cad38', sessionId: '57d4a515-fe86-450e-82c9-8dd710824c3f', personaId: 'elena' }));
      await assertStillResponsive(ws);

      ws.close();
      await handle.close();
    });

    it('ticket #34: sends an error, not a crash, when session_start names a persona whose voice id isn\'t configured', async () => {
      // testEnv() never sets ELEVENLABS_ELENA_VOICE_ID — the real "not launched yet" case.
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'session_start', learnerId: '5c86bf64-d8fa-4b35-8f17-8f797a5cad38', sessionId: '57d4a515-fe86-450e-82c9-8dd710824c3f', personaId: 'elena' }));
      const raw = await once<Buffer>(ws, 'message');
      expect(JSON.parse(raw.toString())).toMatchObject({ type: 'error', message: expect.stringContaining('elena') });

      // The connection itself stays alive and usable — a missing voice id degrades gracefully, doesn't kill the session.
      await assertStillResponsive(ws);

      ws.close();
      await handle.close();
    });

    it('rejects a session_start naming an unrecognized personaId', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'session_start', learnerId: '5c86bf64-d8fa-4b35-8f17-8f797a5cad38', sessionId: '57d4a515-fe86-450e-82c9-8dd710824c3f', personaId: 'not-a-real-persona' }));
      const raw = await once<Buffer>(ws, 'message');
      expect(JSON.parse(raw.toString())).toMatchObject({ type: 'error' });

      ws.close();
      await handle.close();
    });

    // No "accepts a well-formed text_input" happy-path test here, deliberately — unlike
    // audio_chunk (where silent audio never crosses the VAD threshold, so it never triggers a
    // real vendor call), there is no equivalent inert text_input payload: any non-empty text
    // immediately reaches the real safety-detection/persona-generation/TTS pipeline against this
    // environment's fake vendor credentials (docs/adr/0021). The real, meaningful happy-path
    // coverage for ticket #32's text-input pipeline lives in turn-orchestrator.test.ts, against
    // injected fakes — the same place voice's own happy-path pipeline coverage lives.
    it('rejects a malformed text_input (empty text) the same way as any other unrecognized message', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'text_input', text: '' }));
      const raw = await once<Buffer>(ws, 'message');
      expect(JSON.parse(raw.toString())).toMatchObject({ type: 'error' });

      ws.close();
      await handle.close();
    });
  });
});
