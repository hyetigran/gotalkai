import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import type { Env } from './env';
import type { ServerMessage } from './messages';
import { clientMessageSchema } from './messages';
import { generatePersonaTurn } from './persona-turn';
import { detectSafetyTrigger } from './safety-detection';
import { annotateText } from './stress/stress-annotation';
import { createSttSession } from './stt';
import { synthesizeSpeech } from './tts';
import { TurnOrchestrator } from './turn-orchestrator';

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
 * Decodes a base64 PCM chunk into 16-bit samples for VAD/RMS purposes.
 * `Int16Array` over the raw buffer bytes assumes little-endian encoding —
 * the convention `pcm-encode.ts` (mobile) writes, and what `Buffer`'s
 * default byte order matches on every platform Node actually runs on.
 */
function decodePcm16(pcmBase64: string): Int16Array {
  const buffer = Buffer.from(pcmBase64, 'base64');
  return new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 2));
}

/**
 * Starts the voice service: an HTTP server (health check only, for now)
 * plus a WebSocket server on the same port. Auth happens during the
 * upgrade handshake — before any WS connection is accepted — checking a
 * bearer token against `env.VOICE_SERVICE_AUTH_TOKEN` (see env.ts for why
 * this is a placeholder for real per-session credentials).
 *
 * Ticket #18: each connection gets its own `TurnOrchestrator` (#14-#17's
 * modules assembled into one live cascade — see turn-orchestrator.ts and
 * docs/adr/0017 for what's real vs. unverified here). `anthropicClient`/
 * `elevenLabsClient` are constructed once per server, not per connection —
 * they're stateless HTTP/WS clients, no reason to pay setup cost per turn.
 */
export function startServer(env: Env): Promise<VoiceServiceHandle> {
  return new Promise((resolve, reject) => {
    const anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const elevenLabsClient = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });

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
      const orchestrator = new TurnOrchestrator({
        createSttSession,
        generatePersonaTurn,
        detectSafetyTrigger,
        annotateText,
        synthesizeSpeech,
        anthropicClient,
        elevenLabsClient,
        elevenLabsApiKey: env.ELEVENLABS_API_KEY,
        voiceId: env.ELEVENLABS_VALENTINA_VOICE_ID,
        sendMessage: message => send(ws, message),
      });

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
        switch (result.data.type) {
          case 'ping':
            send(ws, { type: 'pong', requestId: result.data.requestId, serverTime: Date.now() });
            return;
          case 'audio_chunk':
            orchestrator.pushAudioFrame(decodePcm16(result.data.pcmBase64), result.data.pcmBase64, result.data.sampleRateHz);
            return;
          case 'hold_start':
            orchestrator.holdStart();
            return;
          case 'hold_end':
            orchestrator.holdEnd();
            return;
          case 'session_start':
            // learnerId/sessionId are received but not yet persisted
            // anywhere (posting turn artifacts/timings back through
            // app-service, per ARCHITECTURE.md §6 step 3, is real,
            // disclosed follow-up work — not built in this pass, see
            // docs/adr/0017). Accepted without error so the client's
            // handshake doesn't fail while that's pending.
            return;
        }
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
