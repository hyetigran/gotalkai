import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createAppServiceClient } from './app-service-client';
import type { Env } from './env';
import type { ServerMessage } from './messages';
import { clientMessageSchema } from './messages';
import { generatePersonaTurn } from './persona-turn';
import { DEFAULT_PERSONA_ID, PERSONA_DEFINITIONS } from './personas';
import type { PersonaId } from './personas';
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
 * `elevenLabsClient`/`appServiceClient` are constructed once per server,
 * not per connection — they're stateless HTTP/WS clients, no reason to
 * pay setup cost per turn.
 *
 * Ticket #29 / docs/adr/0022: `appServiceClient` is the turn-persistence
 * link ARCHITECTURE.md always specified but nothing built — every
 * `session_start` message sets the orchestrator's real session id
 * (`orchestrator.sessionStart`), after which `recordTurn`/
 * `recordInterruption` post real turn artefacts to app-service.
 */
export function startServer(env: Env): Promise<VoiceServiceHandle> {
  return new Promise((resolve, reject) => {
    const anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const elevenLabsClient = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
    const appServiceClient = createAppServiceClient(env.APP_SERVICE_URL);
    /** Ticket #34: which voice id backs which persona — the one piece of persona config that's an env-var secret, kept out of personas.ts itself (see docs/adr/0023). Елена's is `undefined` until a real ElevenLabs account configures one. */
    const voiceIdForPersona: Record<PersonaId, string | undefined> = {
      valentina: env.ELEVENLABS_VALENTINA_VOICE_ID,
      elena: env.ELEVENLABS_ELENA_VOICE_ID,
    };

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
        persona: PERSONA_DEFINITIONS[DEFAULT_PERSONA_ID],
        voiceId: env.ELEVENLABS_VALENTINA_VOICE_ID,
        sendMessage: message => send(ws, message),
        recordTurn: appServiceClient.recordTurn,
        recordInterruption: appServiceClient.recordInterruption,
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
          case 'session_start': {
            // Ticket #29 / docs/adr/0022: the persistence link
            // docs/adr/0017 disclosed as missing — every subsequent
            // recordTurn/recordInterruption call needs this real
            // session id to attribute a turn to. learnerId isn't used
            // here: app-service's POST /sessions/:id/turns is keyed
            // only by session, not learner.
            orchestrator.sessionStart(result.data.sessionId);

            // Ticket #34 / docs/adr/0023: only switch personas when the
            // message actually names one other than the connection-time
            // default — omitting `personaId` (every pre-#34 client)
            // keeps the orchestrator on Валентина, untouched.
            const personaId = result.data.personaId ?? DEFAULT_PERSONA_ID;
            if (personaId !== DEFAULT_PERSONA_ID) {
              const voiceId = voiceIdForPersona[personaId];
              if (!voiceId) {
                send(ws, { type: 'error', message: `voice not configured for persona "${personaId}"` });
                return;
              }
              orchestrator.selectPersona(PERSONA_DEFINITIONS[personaId], voiceId);
            }
            return;
          }
          case 'text_input':
            void orchestrator.submitTextInput(result.data.text);
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
