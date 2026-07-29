import type { ServerMessage, TurnTimestamps, VoiceConnectionState } from '@/lib/voice-service/voice-connection';
import * as React from 'react';

import { VoiceConnection } from '@/lib/voice-service/voice-connection';
import { useTtsPlayback } from './use-tts-playback';

/** README: "Auto-release ~45s, so a learner who puts the phone down cannot hang the session." Same value as the scripted demo (use-converse-session.ts) — a product decision independent of transport. */
const HOLD_AUTO_RELEASE_MS = 45_000;

export type ConverseTurn = {
  /** 'system' is the out-of-character safety escape hatch (ticket #27) — deliberately distinct from 'persona', never Валентина speaking. */
  speaker: 'learner' | 'persona' | 'system';
  text: string;
  comprehension?: string;
  affect?: string;
};

/**
 * `'thinking'` covers both "filler playing, LLM still generating" and
 * "her reply text has arrived but audio hasn't started" — the scripted
 * demo's `phase` collapsed the same distinction (see its own comment);
 * `'speaking'` starts once the first `tts_chunk` for the turn arrives.
 */
export type LiveConversePhase = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'disconnected';

type ConverseState = {
  phase: LiveConversePhase;
  turns: ConverseTurn[];
  holdSeen: boolean;
  lastTimestamps: TurnTimestamps | null;
};

const INITIAL_STATE: ConverseState = { phase: 'connecting', turns: [], holdSeen: false, lastTimestamps: null };

type ConverseAction
  = | { type: 'connection_state'; state: VoiceConnectionState }
    | { type: 'server_message'; message: ServerMessage };

/** Pure: all side effects (TTS playback, sending session_start) live in the effect below, not here. */
function converseReducer(state: ConverseState, action: ConverseAction): ConverseState {
  if (action.type === 'connection_state') {
    if (action.state === 'open')
      return { ...state, phase: 'listening' };
    return { ...state, phase: action.state === 'connecting' ? 'connecting' : 'disconnected' };
  }

  const { message } = action;
  switch (message.type) {
    case 'persona_filler':
      return { ...state, phase: 'thinking', holdSeen: true, turns: [...state.turns, { speaker: 'persona', text: message.text }] };
    case 'transcript_final':
      return { ...state, turns: [...state.turns, { speaker: 'learner', text: message.text }] };
    case 'persona_turn': {
      // Replaces the filler placeholder pushed above, not a new entry — the filler and the real
      // reply are the same conversational turn from the transcript's point of view.
      const last = state.turns[state.turns.length - 1];
      const replyTurn: ConverseTurn = { speaker: 'persona', text: message.text, comprehension: message.comprehension, affect: message.affect };
      const turns = last?.speaker === 'persona' ? [...state.turns.slice(0, -1), replyTurn] : [...state.turns, replyTurn];
      return { ...state, turns };
    }
    case 'safety_response': {
      // Same "replaces the filler placeholder" logic as persona_turn above — filler was already
      // sent before the server knew this turn would trigger the escape hatch.
      const last = state.turns[state.turns.length - 1];
      const systemTurn: ConverseTurn = { speaker: 'system', text: message.text };
      const turns = last?.speaker === 'persona' ? [...state.turns.slice(0, -1), systemTurn] : [...state.turns, systemTurn];
      return { ...state, turns };
    }
    case 'tts_chunk':
      return { ...state, phase: 'speaking' };
    case 'turn_complete':
      return { ...state, phase: 'listening', lastTimestamps: message.timestamps };
    case 'barge_in':
      return { ...state, phase: 'listening' };
    case 'error':
    case 'transcript_partial':
      return state;
    default: {
      // Exhaustiveness check: a new ServerMessage variant added to voice-connection.ts without a
      // matching case here is a compile error, not a silent fallthrough (found as a real gap in
      // this ticket's own code review — this switch previously had no such guard at all).
      const _exhaustive: never = message;
      return state;
    }
  }
}

type UseLiveConverseSessionOptions = {
  url: string;
  token: string;
  learnerId: string;
  sessionId: string;
};

/**
 * Real counterpart to `use-converse-session.ts`'s scripted state machine —
 * ticket #18. Drives `phase`/`turns` off actual server messages instead of
 * local timers, over a real `VoiceConnection`. Preserves the single
 * `hasFloor` check from docs/adr/0002 ("holding does nothing during her
 * turn, and does nothing before the learner has spoken") without
 * special-casing it for the live transport.
 *
 * There is currently no way to trigger this hook's happy path end to end
 * in this environment: nothing sends real `audio_chunk` messages (see
 * docs/adr/0017 — `expo-audio` has no live mic-streaming API), so the
 * server-side pipeline this hook reacts to can never actually fire here.
 * This hook is real, wired, and independently testable against a fake
 * `VoiceConnection`-shaped message stream; it is unverified end to end.
 *
 * Unlike the scripted demo, there is no `speak()` — suggestion chips are
 * PRD-described scaffolding a learner reads aloud into a live mic, not a
 * substitute input; there is no real chip content generated by this
 * ticket's scope either. The live screen doesn't render them (see
 * converse-screen.tsx).
 */
export function useLiveConverseSession({ url, token, learnerId, sessionId }: UseLiveConverseSessionOptions) {
  const [state, dispatch] = React.useReducer(converseReducer, INITIAL_STATE);
  const [holding, setHolding] = React.useState(false);

  const connectionRef = React.useRef<VoiceConnection | null>(null);
  const autoReleaseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdingRef = React.useRef(false);
  const { enqueue: enqueueTts, stopAndClear: stopTts } = useTtsPlayback();

  // docs/adr/0002: holding does nothing during her turn. The scripted demo's
  // `phase` only ever had 'thinking' cover her whole turn; this hook splits
  // that into 'thinking' (generating) and 'speaking' (TTS audio playing), so
  // both must be excluded here, not just 'thinking' — otherwise a hold could
  // start while she's still mid-line.
  const hasFloor = state.phase === 'listening' && state.holdSeen;

  React.useEffect(() => {
    const connection = new VoiceConnection({
      url,
      token,
      onStateChange: (connectionState) => {
        dispatch({ type: 'connection_state', state: connectionState });
        if (connectionState === 'open')
          connection.sendSessionStart(learnerId, sessionId);
      },
      onMessage: (message) => {
        dispatch({ type: 'server_message', message });
        // Playback is a side effect the pure reducer above can't own.
        if (message.type === 'tts_chunk')
          enqueueTts(message.audioBase64);
        // PRD §7.10: "interruption must stop playback" — the server already
        // cancelled generation/TTS on its side; this stops whatever's
        // already been sent and queued locally.
        if (message.type === 'barge_in')
          stopTts();
      },
    });
    connectionRef.current = connection;
    connection.connect();

    return () => {
      connection.disconnect();
      connectionRef.current = null;
      if (autoReleaseTimerRef.current)
        clearTimeout(autoReleaseTimerRef.current);
    };
  }, [url, token, learnerId, sessionId, enqueueTts, stopTts]);

  const holdOff = React.useCallback(() => {
    if (!holdingRef.current)
      return;
    holdingRef.current = false;
    setHolding(false);
    if (autoReleaseTimerRef.current) {
      clearTimeout(autoReleaseTimerRef.current);
      autoReleaseTimerRef.current = null;
    }
    connectionRef.current?.sendHoldEnd();
  }, []);

  const holdOn = React.useCallback(() => {
    if (!hasFloor || holdingRef.current)
      return;
    holdingRef.current = true;
    setHolding(true);
    connectionRef.current?.sendHoldStart();
    autoReleaseTimerRef.current = setTimeout(holdOff, HOLD_AUTO_RELEASE_MS);
  }, [hasFloor, holdOff]);

  return {
    phase: state.phase,
    turns: state.turns,
    holding,
    holdSeen: state.holdSeen,
    hasFloor,
    lastTimestamps: state.lastTimestamps,
    holdOn,
    holdOff,
  };
}
