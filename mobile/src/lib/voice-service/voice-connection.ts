/**
 * Connection manager for the voice service's persistent stream. Ticket
 * #11 built the skeleton (round-trip ping only); ticket #18 adds the real
 * pipeline messages. ARCHITECTURE.md §3.1: "Conversation screen is a
 * special case. Do not force React Query/axios onto the core loop. Own
 * connection manager for the stream." — this is that manager, independent
 * of React.
 *
 * Auth: the token is passed in explicitly by the caller, never read from
 * a bundled env var — until the app service exists to issue real
 * per-session credentials (ARCHITECTURE.md §6), there is no source for a
 * token that's safe to bake into a shipped client bundle. See
 * `voice-service-debug-screen.tsx` for how this is exercised today (a
 * dev-only screen where the token is typed in by hand, not embedded in
 * source).
 *
 * `ServerMessage`/outbound message shapes are hand-mirrored from
 * `voice-service/src/messages.ts` — the two are independent npm projects
 * (no shared package), so the WS wire format itself is the only real
 * contract between them. Keep these in sync by hand on either side.
 */

export type VoiceConnectionState = 'connecting' | 'open' | 'closed';

export type PongMessage = { type: 'pong'; requestId: string | undefined; serverTime: number };

export type TurnTimestamps = {
  t0TurnDetected: number;
  t1SttFinal: number;
  t2PersonaStart: number;
  t3PersonaComplete: number;
  t4StressAnnotated: number;
  t5FirstAudio: number;
};

/** Mirrors voice-service/src/messages.ts's `ServerMessage` (minus `pong`, handled separately by `ping()`). */
export type ServerMessage
  = | { type: 'error'; message: string }
    | { type: 'transcript_partial'; text: string }
    | { type: 'transcript_final'; text: string }
    | { type: 'persona_filler'; text: string }
    | { type: 'persona_turn'; text: string; comprehension: string; affect: string }
    | { type: 'tts_chunk'; sentenceIndex: number; audioBase64: string }
    | { type: 'turn_complete'; timestamps: TurnTimestamps }
    | { type: 'barge_in' };

function isServerMessage(value: unknown): value is ServerMessage {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/** React Native's WebSocket constructor overload lib.dom.d.ts doesn't declare — see the comment at the call site. */
type RNWebSocketConstructor = new (
  url: string,
  protocols: string | string[] | undefined,
  options?: { headers?: Record<string, string> },
) => WebSocket;

export type VoiceConnectionOptions = {
  url: string;
  token: string;
  onStateChange?: (state: VoiceConnectionState) => void;
  /** Pipeline server messages only — `pong` is handled internally by `ping()` and not forwarded here. */
  onMessage?: (message: ServerMessage) => void;
  /** Delay before retrying after an unexpected close — AC: "client reconnects rather than hanging indefinitely." */
  reconnectDelayMs?: number;
};

type PendingPing = {
  resolve: (message: PongMessage) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

function isPongMessage(value: unknown): value is PongMessage {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'pong';
}

export class VoiceConnection {
  private ws: WebSocket | null = null;
  private state: VoiceConnectionState = 'closed';
  private shouldReconnect = false;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingPings = new Map<string, PendingPing>();

  constructor(private readonly options: VoiceConnectionOptions) {}

  connect(): void {
    this.shouldReconnect = true;
    this.open();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  getState(): VoiceConnectionState {
    return this.state;
  }

  ping(timeoutMs = 5000): Promise<PongMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.state !== 'open') {
        reject(new Error('voice connection is not open'));
        return;
      }
      const ws = this.ws;
      const requestId = Math.random().toString(36).slice(2);
      const timeoutId = setTimeout(() => {
        this.pendingPings.delete(requestId);
        reject(new Error('ping timed out'));
      }, timeoutMs);
      this.pendingPings.set(requestId, { resolve, reject, timeoutId });
      ws.send(JSON.stringify({ type: 'ping', requestId }));
    });
  }

  /**
   * Audio frames are naturally lossy (VAD tolerates dropped frames
   * elsewhere in this pipeline too) — a chunk sent while briefly
   * disconnected is silently dropped rather than thrown, so a live mic
   * capture loop (once one exists — see docs/adr/0017) doesn't need to
   * guard every call.
   */
  sendAudioChunk(pcmBase64: string, sampleRateHz: number): void {
    this.trySend({ type: 'audio_chunk', pcmBase64, sampleRateHz });
  }

  /**
   * Unlike audio chunks, a dropped hold_start/hold_end is a real
   * correctness gap (the server could be left thinking the learner is
   * still holding, or not) — but the client already only calls these on
   * explicit user action, and a reconnect re-syncs state implicitly
   * through the fresh connection's default (server never holds). Silent
   * drop on disconnect is accepted rather than queuing/retrying, since
   * that reconnect-resync already bounds the damage.
   */
  sendHoldStart(): void {
    this.trySend({ type: 'hold_start' });
  }

  sendHoldEnd(): void {
    this.trySend({ type: 'hold_end' });
  }

  sendSessionStart(learnerId: string, sessionId: string): void {
    this.trySend({ type: 'session_start', learnerId, sessionId });
  }

  private trySend(message: { type: string; [key: string]: unknown }): boolean {
    if (!this.ws || this.state !== 'open')
      return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  private open(): void {
    this.setState('connecting');
    // React Native's WebSocket accepts a third `{ headers }` constructor
    // argument at runtime — verified against
    // node_modules/react-native/Libraries/WebSocket/WebSocket.js, which
    // destructures `options.headers` and forwards it to
    // NativeWebSocketModule.connect(). Re-check that file on RN upgrades;
    // the ambient `WebSocket` type here resolves to lib.dom.d.ts's
    // 2-argument browser signature, which doesn't know about it.
    const ws = new (WebSocket as unknown as RNWebSocketConstructor)(this.options.url, undefined, {
      headers: { Authorization: `Bearer ${this.options.token}` },
    });
    this.ws = ws;

    ws.onopen = () => this.setState('open');

    ws.onmessage = (event) => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      }
      catch {
        return;
      }
      if (isPongMessage(message)) {
        if (message.requestId) {
          const pending = this.pendingPings.get(message.requestId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            this.pendingPings.delete(message.requestId);
            pending.resolve(message);
          }
        }
        return;
      }
      if (isServerMessage(message))
        this.options.onMessage?.(message);
    };

    ws.onclose = () => {
      this.setState('closed');
      this.ws = null;
      // Fail fast instead of leaving callers waiting out the full ping
      // timeout for a request that can no longer possibly be answered.
      for (const pending of this.pendingPings.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('voice connection closed'));
      }
      this.pendingPings.clear();
      if (this.shouldReconnect)
        this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId)
      return;
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      if (this.shouldReconnect)
        this.open();
    }, this.options.reconnectDelayMs ?? 2000);
  }

  private setState(state: VoiceConnectionState): void {
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
