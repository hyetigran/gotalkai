import type { Env } from '../config/env';
import { createHmac } from 'node:crypto';
import WebSocket from 'ws';
import { startServer } from './server';

const SESSION_TOKEN_SECRET = 'test-session-token-secret-0123456789abcdef';
/** Matches the sessionId already used by the pre-existing `session_start` fixtures below — chosen so the default `AUTH_TOKEN` and a well-formed `session_start` message agree, as a real client/token pair would. */
const AUTHENTICATED_SESSION_ID = '57d4a515-fe86-450e-82c9-8dd710824c3f';

/**
 * Test-only mirror of app-service's `issueSessionToken` (session-token.ts
 * there has no counterpart here — this service only ever verifies
 * tokens, never mints them in production code) — just enough to produce
 * a token `verifySessionToken` accepts, standing in for "app-service
 * already ran `POST /sessions`."
 */
function issueTestToken(secret: string, sessionId: string, exp = Date.now() + 60_000): string {
  const payloadPart = Buffer.from(JSON.stringify({ sessionId, exp }), 'utf8').toString('base64url');
  const signaturePart = createHmac('sha256', secret).update(payloadPart).digest('base64url');
  return `${payloadPart}.${signaturePart}`;
}

const AUTH_TOKEN = issueTestToken(SESSION_TOKEN_SECRET, AUTHENTICATED_SESSION_ID);

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 0, // ask the OS for a free port
    NODE_ENV: 'test',
    SESSION_TOKEN_SECRET,
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

  it('rejects an upgrade with a malformed token', async () => {
    const handle = await startServer(testEnv());
    const ws = connect(handle.port, 'wrong-token');
    const statusCode = await expectHandshakeRejection(ws);
    expect(statusCode).toBe(401);
    await handle.close();
  });

  it('rejects an upgrade with a well-formed token signed by the wrong secret', async () => {
    const handle = await startServer(testEnv());
    const forgedToken = issueTestToken('a-completely-different-secret-abcdef0123', AUTHENTICATED_SESSION_ID);
    const ws = connect(handle.port, forgedToken);
    const statusCode = await expectHandshakeRejection(ws);
    expect(statusCode).toBe(401);
    await handle.close();
  });

  it('rejects an upgrade with an expired token', async () => {
    const handle = await startServer(testEnv());
    const expiredToken = issueTestToken(SESSION_TOKEN_SECRET, AUTHENTICATED_SESSION_ID, Date.now() - 1000);
    const ws = connect(handle.port, expiredToken);
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

    // Ticket #40 removed VAD: there is no longer an "inert" audio_chunk
    // payload that avoids a real vendor call — every frame, silent or
    // not, immediately opens a real STT session attempt (pushAudioFrame
    // no longer makes any speech/silence judgement of its own; see its
    // own comment in turn-orchestrator.ts). No happy-path test exists
    // here for the same reason none exists for text_input just below —
    // "any non-empty [payload] immediately reaches the real ... pipeline
    // against this environment's fake vendor credentials." Real-pipeline
    // behavior is exercised in turn-orchestrator.test.ts against fakes;
    // this suite only proves server.ts's message routing/schema
    // validation itself doesn't crash.
    it('rejects a malformed audio_chunk (missing sampleRateHz) the same way as any other unrecognized message', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'audio_chunk', pcmBase64: 'AAAA', commit: false }));
      const raw = await once<Buffer>(ws, 'message');
      expect(JSON.parse(raw.toString())).toMatchObject({ type: 'error' });

      ws.close();
      await handle.close();
    });

    it('rejects an audio_chunk missing the required commit flag', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      ws.send(JSON.stringify({ type: 'audio_chunk', pcmBase64: 'AAAA', sampleRateHz: 8000 }));
      const raw = await once<Buffer>(ws, 'message');
      expect(JSON.parse(raw.toString())).toMatchObject({ type: 'error' });

      ws.close();
      await handle.close();
    });

    // hold_start/hold_end (hold-to-think) were removed entirely with VAD
    // (ticket #40) — a client that still sends them now just gets the
    // same generic "unrecognized message" rejection any unknown type
    // does, already covered by this suite's other malformed-message tests.

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

    it('rejects a session_start whose sessionId does not match the authenticated token — a client cannot claim a different session than the one it was issued a credential for', async () => {
      const handle = await startServer(testEnv());
      const ws = connect(handle.port, AUTH_TOKEN);
      await once(ws, 'open');

      const impersonatedSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // well-formed UUID (zod's `.uuid()` is strict about version/variant nibbles), just not AUTHENTICATED_SESSION_ID
      ws.send(JSON.stringify({ type: 'session_start', learnerId: '5c86bf64-d8fa-4b35-8f17-8f797a5cad38', sessionId: impersonatedSessionId }));
      const raw = await once<Buffer>(ws, 'message');
      const response = JSON.parse(raw.toString());
      expect(response.type).toBe('error');
      expect(response.message).toMatch(/does not match/);

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
    //
    // Same reasoning, same absence, for begin_conversation (PRD §6.2's opening line): it has no
    // fields to send malformed, and its only real behavior is a real TTS call — happy-path
    // coverage for openConversation lives in turn-orchestrator.test.ts's own describe block.
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
