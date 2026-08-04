import type { TurnComprehension } from './api';
import type { ServerMessage, TurnTimestamps, VoiceConnectionState } from '@/lib/voice-service/voice-connection';

import * as React from 'react';
import { configureConverseAudioSession } from '@/lib/audio/audio-session';
import { VoiceConnection } from '@/lib/voice-service/voice-connection';
import { useMarkTurnRevealed, useRecordTurn } from './api';
import { useTtsPlayback } from './use-tts-playback';

export type ConverseTurn = {
  /** 'system' is the out-of-character safety escape hatch (ticket #27) — deliberately distinct from 'persona', never Валентина speaking. */
  speaker: 'learner' | 'persona' | 'system';
  text: string;
  comprehension?: string;
  affect?: string;
  /** PRD §6.2 tap-to-reveal — only ever present on 'persona' turns (the server only sends it on persona_turn); undefined for 'learner'/'system'. */
  translation?: string;
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
  lastTimestamps: TurnTimestamps | null;
};

const INITIAL_STATE: ConverseState = { phase: 'connecting', turns: [], lastTimestamps: null };

type ConverseAction
  = | { type: 'connection_state'; state: VoiceConnectionState }
    | { type: 'server_message'; message: ServerMessage };

/** Pure: all side effects (TTS playback, sending session_start) live in the effect below, not here. */
function converseReducer(state: ConverseState, action: ConverseAction): ConverseState {
  if (action.type === 'connection_state') {
    const nextPhase = action.state === 'open' ? 'listening' : action.state === 'connecting' ? 'connecting' : 'disconnected';
    return { ...state, phase: nextPhase };
  }

  const { message } = action;
  switch (message.type) {
    case 'persona_filler':
      // UAT: "get rid of [the filler] completely" — text and (the mobile
      // side never actually spoke it; only the server-side FILLER_LINES
      // text existed) audio both gone. Still updates phase: the server
      // still sends this message to mark "she's now generating a
      // reply" — just no turn gets pushed for it anymore, so nothing
      // renders and nothing needs replacing once the real reply arrives.
      return { ...state, phase: 'thinking' };
    case 'transcript_final':
      return { ...state, turns: [...state.turns, { speaker: 'learner', text: message.text }] };
    case 'persona_turn': {
      // UAT: "char's initial dialogue disappeared and 'sorry I didn't
      // understand' displayed" — this case used to replace the last turn
      // whenever it was also 'persona', "defensively," for an unspecified
      // "some other reason." That silently clobbered a real turn (e.g.
      // her opening line) whenever the *next* server message was also a
      // persona_turn with no learner turn in between — not just the
      // acoustic-feedback bug (see turn-orchestrator.ts's pushAudioFrame),
      // but any genuinely low-confidence first utterance too (the
      // "didn't catch that" fallback sends no transcript_final at all).
      // Always appends now — every persona_turn is its own real turn.
      const replyTurn: ConverseTurn = { speaker: 'persona', text: message.text, comprehension: message.comprehension, affect: message.affect, translation: message.translation };
      return { ...state, turns: [...state.turns, replyTurn] };
    }
    case 'safety_response': {
      const systemTurn: ConverseTurn = { speaker: 'system', text: message.text };
      return { ...state, turns: [...state.turns, systemTurn] };
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

/** Ticket #32 AC #2: "switchable per session," not a permanent account-level setting — local component state, not persisted anywhere. */
export type InputMode = 'voice' | 'text';

/**
 * Real counterpart to `use-converse-session.ts`'s scripted state machine —
 * ticket #18. Drives `phase`/`turns` off actual server messages instead of
 * local timers, over a real `VoiceConnection`.
 *
 * Ticket #40 (PRD §7.9): turn-taking is hold-to-talk now, not VAD-gated
 * open-mic — `use-hold-to-talk.ts` owns the press/release lifecycle and
 * mic capture, calling this hook's `sendAudioChunk` with the `commit` flag
 * that's now the turn boundary. This hook itself no longer has any
 * "hold"/"floor" concept — there's no open mic to gate in the first place.
 *
 * Unlike the scripted demo, there is no `speak()` — suggestion chips are
 * PRD-described scaffolding a learner reads aloud into a live mic, not a
 * substitute input; there is no real chip content generated by this
 * ticket's scope either. The live screen doesn't render them (see
 * converse-screen.tsx).
 */
/**
 * Opens (and tears down) the `VoiceConnection` for the hook's whole
 * lifetime, owning `connectionRef` itself rather than receiving it as a
 * mutable argument (the React Compiler lint flags writing into a ref
 * passed in from outside) — returned instead, so the caller only ever
 * reads `.current` from it. Pulled out of `useLiveConverseSession` itself
 * purely to stay under this repo's max-lines-per-function budget — same
 * reasoning `use-native-pcm-capture.ts` already documents for its own
 * extracted `useCaptureEventSubscriptions`/`useAppStateCaptureSync`
 * hooks, not a meaningfully separate concern on its own.
 */
function useVoiceConnectionLifecycle(options: {
  url: string;
  token: string;
  learnerId: string;
  sessionId: string;
  dispatch: React.Dispatch<ConverseAction>;
  enqueueTts: (audioBase64: string) => void;
  stopTts: () => void;
}): React.RefObject<VoiceConnection | null> {
  const { url, token, learnerId, sessionId, dispatch, enqueueTts, stopTts } = options;
  const connectionRef = React.useRef<VoiceConnection | null>(null);

  React.useEffect(() => {
    const connection = new VoiceConnection({
      url,
      token,
      onStateChange: (connectionState) => {
        dispatch({ type: 'connection_state', state: connectionState });
        if (connectionState === 'open') {
          connection.sendSessionStart(learnerId, sessionId);
          // PRD §6.2: "she opens, not the learner" — tells the server it's
          // safe to start her opening line now that this screen is actually
          // ready to receive tts_chunks, not just that the raw socket opened.
          connection.sendBeginConversation();
        }
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
    };
  }, [url, token, learnerId, sessionId, enqueueTts, stopTts, dispatch]);

  return connectionRef;
}

/**
 * docs/adr/0022's own disclosed gap, finally closed: "no mobile client
 * calls [the turns write path] yet." Persists every learner/persona
 * turn as it lands in `turns` — the Debrief screen's summary
 * (session-summary.ts) and the post-session analyser both read this
 * back later. `'system'` turns are skipped: `turns.speaker` has a real
 * `CHECK (speaker IN ('persona', 'learner'))` constraint, and a safety
 * escape-hatch line isn't a turn either side spoke.
 *
 * Watches `turns` itself (not the raw server-message stream) so the
 * index a persisted id is stored under always matches
 * `LiveTranscript`'s own array index — the same index its local
 * `revealed` state and this hook's `markRevealed` both key off.
 * `persistedCountRef` tracks how much of `turns` has already been sent,
 * so a re-render never re-POSTs an earlier turn.
 */
function useTurnPersistence(sessionId: string, turns: ConverseTurn[]) {
  const { mutate: recordTurn } = useRecordTurn();
  const { mutate: markTurnRevealed } = useMarkTurnRevealed();
  const persistedCountRef = React.useRef(0);
  const turnIdsRef = React.useRef<Record<number, string>>({});

  // Destructured to `.mutate` above specifically so it can sit in this
  // effect's own deps array honestly — react-query's own `.mutate` is a
  // stable reference across renders (unlike the mutation result object
  // react-query-kit returns a new copy of each render), so listing it
  // doesn't cause an extra run, and every dependency this effect reads
  // is now real, with no `eslint-disable` needed to get there.
  React.useEffect(() => {
    for (let index = persistedCountRef.current; index < turns.length; index++) {
      const turn = turns[index];
      if (!turn || turn.speaker === 'system')
        continue;
      recordTurn(
        {
          sessionId,
          speaker: turn.speaker,
          content: turn.text,
          comprehension: turn.speaker === 'persona' ? (turn.comprehension as TurnComprehension | undefined) : undefined,
        },
        { onSuccess: (result) => { turnIdsRef.current[index] = result.id; } },
      );
    }
    persistedCountRef.current = turns.length;
  }, [turns, sessionId, recordTurn]);

  const markRevealed = React.useCallback((index: number) => {
    const turnId = turnIdsRef.current[index];
    if (turnId)
      markTurnRevealed({ turnId });
  }, [markTurnRevealed]);

  return { markRevealed };
}

export function useLiveConverseSession({ url, token, learnerId, sessionId }: UseLiveConverseSessionOptions) {
  const [state, dispatch] = React.useReducer(converseReducer, INITIAL_STATE);
  const [mode, setMode] = React.useState<InputMode>('voice');

  const { enqueue: enqueueTts, stopAndClear: stopTts } = useTtsPlayback();

  // The scripted demo's useMicCapture calls this before recording; the live
  // pipeline uses native PCM capture instead (see use-native-pcm-capture.ts)
  // and never went through that call, so expo-audio's playback session was
  // left at its default — which does not play while the device is in silent
  // mode. Without this, TTS chunks decode and "play" into silence.
  React.useEffect(() => {
    void configureConverseAudioSession();
  }, []);

  const connectionRef = useVoiceConnectionLifecycle({ url, token, learnerId, sessionId, dispatch, enqueueTts, stopTts });
  const { markRevealed } = useTurnPersistence(sessionId, state.turns);

  /**
   * Ticket #32: the text-input path. Deliberately thin — everything that
   * makes text mode "preserve the persona experience" (AC #1: same
   * recasts, same register, same debrief/memory machinery) happens
   * server-side in turn-orchestrator.ts's shared `runPersonaCascade`, not
   * here. This function's only job is getting the typed string onto the
   * wire; the resulting `persona_filler`/`transcript_final`/`persona_turn`/
   * `tts_chunk`/`turn_complete` messages flow back through the exact same
   * reducer above that handles a voice turn — no separate text-mode
   * branch exists in `converseReducer` because none is needed.
   */
  const submitText = React.useCallback((text: string) => {
    connectionRef.current?.sendTextInput(text);
  }, [connectionRef]);

  /**
   * docs/adr/0026: the send-side counterpart to real mic capture
   * (`use-native-pcm-capture.ts`). Ticket #40: `commit` is the turn
   * boundary now (true on exactly the chunk sent when the talk button is
   * released — see `use-hold-to-talk.ts`, the caller). Silently drops
   * while disconnected, same as `VoiceConnection.sendAudioChunk` itself
   * already does — see that method's own comment for why that's fine
   * here.
   */
  const sendAudioChunk = React.useCallback((pcmBase64: string, sampleRateHz: number, commit: boolean) => {
    connectionRef.current?.sendAudioChunk(pcmBase64, sampleRateHz, commit);
  }, [connectionRef]);

  return {
    phase: state.phase,
    turns: state.turns,
    lastTimestamps: state.lastTimestamps,
    mode,
    setMode,
    submitText,
    sendAudioChunk,
    markRevealed,
  };
}
