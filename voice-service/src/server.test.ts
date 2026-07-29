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
});
