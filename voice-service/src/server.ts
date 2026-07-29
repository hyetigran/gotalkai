import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { Env } from './env';
import type { ServerMessage } from './messages';
import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { clientMessageSchema } from './messages';

export type VoiceServiceHandle = {
  /** The port actually bound — matters when `env.PORT` is `0` (tests ask the OS to pick a free port). */
  port: number;
  close: () => Promise<void>;
};

function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header)
    return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token)
    return null;
  return token;
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

/**
 * Starts the voice service: an HTTP server (health check only, for now)
 * plus a WebSocket server on the same port. Auth happens during the
 * upgrade handshake — before any WS connection is accepted — checking a
 * bearer token against `env.VOICE_SERVICE_AUTH_TOKEN` (see env.ts for why
 * this is a placeholder for real per-session credentials).
 *
 * No provider API keys live here or anywhere reachable from the client —
 * this skeleton proves the authenticated-connection path, nothing else.
 */
export function startServer(env: Env): Promise<VoiceServiceHandle> {
  return new Promise((resolve, reject) => {
    const httpServer = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('voice-service ok');
    });

    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
      const token = extractBearerToken(req);
      if (token !== env.VOICE_SERVICE_AUTH_TOKEN) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });

    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString());
        }
        catch {
          send(ws, { type: 'error', message: 'invalid JSON' });
          return;
        }
        const result = clientMessageSchema.safeParse(parsed);
        if (!result.success) {
          send(ws, { type: 'error', message: 'unrecognized message' });
          return;
        }
        if (result.data.type === 'ping')
          send(ws, { type: 'pong', requestId: result.data.requestId, serverTime: Date.now() });
      });
    });

    httpServer.once('error', reject);
    httpServer.listen(env.PORT, () => {
      const address = httpServer.address();
      const port = typeof address === 'object' && address !== null ? address.port : env.PORT;
      resolve({
        port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            for (const client of wss.clients) client.terminate();
            wss.close(() => {
              httpServer.close((err) => {
                if (err)
                  closeReject(err);
                else
                  closeResolve();
              });
            });
          }),
      });
    });
  });
}
