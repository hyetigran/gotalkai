import type Anthropic from '@anthropic-ai/sdk';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { ServerMessage } from './messages';
import type { GeneratePersonaTurnResult } from './persona-turn';
import type { SafetyCategory } from './safety-detection';
import type { SttEventHandlers, SttTranscript, SttWord } from './stt';
import type { TtsEventHandlers } from './tts';
import { type RecordedTurnInput, TurnOrchestrator, type TurnOrchestratorDeps } from './turn-orchestrator';

/** Ticket #40: amplitude is no longer meaningful — there's no VAD/RMS threshold left to cross. Kept as "a real audio frame" for readability at call sites. */
function loudFrame(length = 160, amplitude = 20000): Int16Array {
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) samples[i] = i % 2 === 0 ? amplitude : -amplitude;
  return samples;
}

function goodWord(text: string, logprob = -0.05): SttWord {
  return { text, type: 'word', logprob };
}

/**
 * Waits for a specific message type to have been sent, regardless of how
 * many async hops it takes to get there — robust against the
 * orchestrator's internal await chain length.
 *
 * Tracks a per-type "consumed" count, not just "has this type ever
 * appeared" — a `waitFor(type)` call always resolves for the next
 * occurrence *beyond* what earlier `waitFor` calls for that same type
 * already claimed. Multi-turn tests call `waitFor('turn_complete')` more
 * than once expecting each call to wait for that turn's own
 * `turn_complete`, not immediately resolve because turn one's is still
 * sitting in `messages` — the original boolean version of this got that
 * wrong (found when adding one more await hop elsewhere shifted timing
 * enough to expose it: a call that used to "work" only because the next
 * turn's real event happened to land before the assertion ran).
 */
function createMessageWaiter() {
  const messages: ServerMessage[] = [];
  const waiters = new Map<string, () => void>();
  const consumedCounts = new Map<string, number>();
  const sendMessage = (message: ServerMessage): void => {
    messages.push(message);
    const waiter = waiters.get(message.type);
    if (waiter) {
      waiters.delete(message.type);
      waiter();
    }
  };
  const waitFor = (type: ServerMessage['type']): Promise<void> => {
    const alreadyConsumed = consumedCounts.get(type) ?? 0;
    const occurrences = messages.filter(message => message.type === type).length;
    if (occurrences > alreadyConsumed) {
      consumedCounts.set(type, alreadyConsumed + 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      waiters.set(type, () => {
        consumedCounts.set(type, (consumedCounts.get(type) ?? 0) + 1);
        resolve();
      });
    });
  };
  return { messages, sendMessage, waitFor };
}

type FakeDepsOptions = {
  personaTurn?: GeneratePersonaTurnResult;
  ttsChunks?: number;
  safetyCategory?: SafetyCategory;
};

function fakeDeps(waiter: ReturnType<typeof createMessageWaiter>, options: FakeDepsOptions = {}) {
  const sttHandlers: SttEventHandlers[] = [];
  const sttSendAudioChunk = jest.fn();
  const sttClose = jest.fn();
  const generatePersonaTurn = jest.fn(async (): Promise<GeneratePersonaTurnResult> =>
    options.personaTurn ?? { turn: { comprehension: 'understood', affect: 'warm', text: 'Ах, конечно.', translation: 'Ah, of course.' }, fellBackToFiller: false, rawOutput: '', usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } });
  const detectSafetyTrigger = jest.fn(async (): Promise<SafetyCategory> => options.safetyCategory ?? 'none');
  const annotateText = jest.fn((text: string) => ({ text: `${text}[annotated]`, unresolvedWords: [] }));
  const synthesizeSpeech = jest.fn(async (_client: unknown, _voiceId: string, _text: string, handlers?: TtsEventHandlers) => {
    const chunkCount = options.ttsChunks ?? 1;
    for (let i = 0; i < chunkCount; i++) handlers?.onChunk?.({ audioBase64: `chunk-${i}` } as never, i);
    return [];
  });
  let clock = 0;
  let nextTurnId = 0;
  // Ticket #29: resolves with a fresh fake id per call by default, matching the real app-service endpoint's contract (turns.ts's recordTurn) closely enough for orchestrator-level tests — individual tests override this when they need to assert on specific ids/failures.
  const recordTurn = jest.fn(async (_sessionId: string, _turn: RecordedTurnInput): Promise<string | null> => `turn-${nextTurnId++}`);
  const recordInterruption = jest.fn(async (_turnId: string, _interruptedAfterMs: number): Promise<void> => {});

  const deps: TurnOrchestratorDeps = {
    createSttSession: jest.fn((_apiKey: string, handlers: SttEventHandlers) => {
      sttHandlers.push(handlers);
      return { sendAudioChunk: sttSendAudioChunk, close: sttClose };
    }),
    generatePersonaTurn,
    detectSafetyTrigger,
    annotateText,
    synthesizeSpeech,
    anthropicClient: {} as Anthropic,
    elevenLabsClient: {} as ElevenLabsClient,
    elevenLabsApiKey: 'test-key',
    voiceId: 'voice-123',
    sendMessage: waiter.sendMessage,
    recordTurn,
    recordInterruption,
    now: () => clock++,
  };

  return { deps, sttHandlers, sttSendAudioChunk, sttClose, generatePersonaTurn, detectSafetyTrigger, annotateText, synthesizeSpeech, recordTurn, recordInterruption };
}

/** Ticket #40: one non-final chunk (button still held) then the release chunk (commit: true) — the standard "learner pressed, spoke, released" sequence for these tests. */
function speakOneUtterance(orchestrator: TurnOrchestrator): void {
  orchestrator.pushAudioFrame(loudFrame(), 'chunk-1', 8000, false);
  orchestrator.pushAudioFrame(loudFrame(), 'chunk-2', 8000, true);
}

const goodTranscript: SttTranscript = { text: 'Привет, как дела?', words: [goodWord('Привет'), goodWord('как'), goodWord('дела')] };

describe('TurnOrchestrator', () => {
  it('opens an STT session on the first frame of a press and forwards audio while listening', () => {
    const waiter = createMessageWaiter();
    const { deps, sttSendAudioChunk } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    orchestrator.pushAudioFrame(loudFrame(), 'loud-base64', 8000, false);

    expect(deps.createSttSession).toHaveBeenCalledTimes(1);
    expect(sttSendAudioChunk).toHaveBeenCalledWith('loud-base64', 8000, false);
  });

  it('does not open an STT session or forward anything while not listening (e.g. mid-turn)', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttSendAudioChunk } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    await waiter.waitFor('persona_filler'); // now 'processing', not 'listening'
    sttSendAudioChunk.mockClear();

    orchestrator.pushAudioFrame(loudFrame(), 'stray-frame', 8000, false);

    expect(sttSendAudioChunk).not.toHaveBeenCalled();
  });

  it('sends an in-character filler line immediately on turn-detect, before the STT result is available (PRD §7.3 latency masking)', () => {
    const waiter = createMessageWaiter();
    const { deps } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);

    expect(waiter.messages.some(message => message.type === 'persona_filler')).toBe(true);
    // Nothing further yet — the STT promise hasn't resolved.
    expect(waiter.messages.some(message => message.type === 'persona_turn')).toBe(false);
  });

  it(
    'runs the full cascade for a real turn: STT -> persona LLM -> stress annotation -> TTS -> turn_complete, in that order, with real conversation history threaded to generatePersonaTurn',
    async () => {
      const waiter = createMessageWaiter();
      const { deps, sttHandlers, generatePersonaTurn, annotateText, synthesizeSpeech } = fakeDeps(waiter);
      const orchestrator = new TurnOrchestrator(deps);

      speakOneUtterance(orchestrator);
      sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
      await waiter.waitFor('turn_complete');

      expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, [{ speaker: 'learner', text: goodTranscript.text }]);
      expect(annotateText).toHaveBeenCalledWith('Ах, конечно.');
      expect(waiter.messages).toContainEqual({ type: 'transcript_final', text: goodTranscript.text });
      expect(synthesizeSpeech).toHaveBeenCalledWith(deps.elevenLabsClient, 'voice-123', 'Ах, конечно.[annotated]', expect.any(Object));

      const types = waiter.messages.map(message => message.type);
      expect(types).toEqual(['persona_filler', 'transcript_final', 'persona_turn', 'tts_chunk', 'turn_complete']);

      const turnComplete = waiter.messages.find(message => message.type === 'turn_complete');
      expect(turnComplete?.type).toBe('turn_complete');
      if (turnComplete?.type === 'turn_complete') {
        const t = turnComplete.timestamps;
        // Monotonically non-decreasing, matching pipeline order (PRD §7.3's six-timestamp instrumentation).
        expect(t.t0TurnDetected).toBeLessThanOrEqual(t.t1SttFinal);
        expect(t.t1SttFinal).toBeLessThanOrEqual(t.t2PersonaStart);
        expect(t.t2PersonaStart).toBeLessThanOrEqual(t.t3PersonaComplete);
        expect(t.t3PersonaComplete).toBeLessThanOrEqual(t.t4StressAnnotated);
        expect(t.t4StressAnnotated).toBeLessThanOrEqual(t.t5FirstAudio);
      }
    },
  );

  it(
    'sends generatePersonaTurn\'s translation field on persona_turn — PRD §6.2 tap-to-reveal, real-pipeline counterpart to the scripted demo\'s hand-authored `en` field (UAT: "the text is no longer clickable to show translation. add it back")',
    async () => {
      const waiter = createMessageWaiter();
      const { deps, sttHandlers } = fakeDeps(waiter, {
        personaTurn: {
          turn: { comprehension: 'understood', affect: 'warm', text: 'Ах, конечно.', translation: 'Ah, of course.' },
          fellBackToFiller: false,
          rawOutput: '',
          usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
        },
      });
      const orchestrator = new TurnOrchestrator(deps);

      speakOneUtterance(orchestrator);
      sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
      await waiter.waitFor('turn_complete');

      expect(waiter.messages).toContainEqual({
        type: 'persona_turn',
        text: 'Ах, конечно.',
        comprehension: 'understood',
        affect: 'warm',
        translation: 'Ah, of course.',
      });
    },
  );

  it('accumulates real conversation history across multiple turns', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    speakOneUtterance(orchestrator);
    sttHandlers[1]?.onFinalTranscript?.({ text: 'Второй вопрос.', words: [goodWord('Второй'), goodWord('вопрос')] });
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).toHaveBeenLastCalledWith(deps.anthropicClient, [
      { speaker: 'learner', text: 'Привет, как дела?' },
      { speaker: 'persona', text: 'Ах, конечно.' },
      { speaker: 'learner', text: 'Второй вопрос.' },
    ]);
  });

  it(
    'responds with the "didn\'t catch that" line and skips the LLM/TTS entirely when STT confidence is low (PRD §5.7 mechanic)',
    async () => {
      const waiter = createMessageWaiter();
      const { deps, sttHandlers, generatePersonaTurn, synthesizeSpeech } = fakeDeps(waiter);
      const orchestrator = new TurnOrchestrator(deps);

      speakOneUtterance(orchestrator);
      // -7/-8 (avg -7.5), not the old -4/-5 fixture — real logcat data
      // (LOW_CONFIDENCE_AVG_LOGPROB_THRESHOLD's own comment) put clean,
      // correctly-heard speech at -3 to -4.5 and the one genuine
      // disfluency this codebase has actually observed at -6.5; -4/-5
      // would no longer represent "low confidence" at all under the
      // recalibrated -6 threshold.
      sttHandlers[0]?.onFinalTranscript?.({ text: 'мумбл мумбл', words: [goodWord('мумбл', -7), goodWord('мумбл', -8)] });
      await waiter.waitFor('turn_complete');

      expect(generatePersonaTurn).not.toHaveBeenCalled();
      expect(synthesizeSpeech).not.toHaveBeenCalled();
      const personaTurnMessage = waiter.messages.find(message => message.type === 'persona_turn');
      expect(personaTurnMessage).toMatchObject({ type: 'persona_turn', comprehension: 'not_understood' });
      // Even on the low-confidence path, PRD §6.2 wants "what she heard" shown — not just her not-understood reply.
      expect(waiter.messages).toContainEqual({ type: 'transcript_final', text: 'мумбл мумбл' });
    },
  );

  it('treats a genuinely empty transcript (no text at all) as low confidence too, not a crash', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.({ text: '', words: [] });
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).not.toHaveBeenCalled();
  });

  it(
    'runs the normal persona cascade for real, non-empty text with an empty words array — the real ElevenLabs committed_transcript shape (no "_with_timestamps"), which carries no per-word breakdown at all despite include_timestamps being requested (UAT: real, correctly-heard, on-screen speech got "I didn\'t understand you" every single time — words.length === 0 was treated as automatic low confidence regardless of real, non-empty text)',
    async () => {
      const waiter = createMessageWaiter();
      const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter);
      const orchestrator = new TurnOrchestrator(deps);

      speakOneUtterance(orchestrator);
      sttHandlers[0]?.onFinalTranscript?.({ text: 'Понял.', words: [] });
      await waiter.waitFor('turn_complete');

      expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, [{ speaker: 'learner', text: 'Понял.' }]);
    },
  );

  it('degrades to the "didn\'t catch that" line (not a crash) when the STT vendor itself errors', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    expect(() => sttHandlers[0]?.onError?.(new Error('vendor unavailable'))).not.toThrow();
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).not.toHaveBeenCalled();
  });

  it(
    'still degrades to "didn\'t catch that" (not a permanent hang) when the STT vendor errors *before* commit — a real deadlock: the error used to arrive while pendingTranscript was still null, so handleTurnDetected\'s later promise, tied to an already-dead session, could never settle (UAT: "the \'nu\' filler text still renders, my voice isn\'t captured")',
    async () => {
      const waiter = createMessageWaiter();
      const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter);
      const orchestrator = new TurnOrchestrator(deps);

      // First frame creates the STT session — then the vendor rejects the
      // connection immediately, well before any commit frame arrives.
      orchestrator.pushAudioFrame(loudFrame(), 'chunk-1', 8000, false);
      expect(() => sttHandlers[0]?.onError?.(new Error('auth_error: not authenticated'))).not.toThrow();

      // Only now does the button release, committing the turn.
      orchestrator.pushAudioFrame(loudFrame(), 'chunk-2', 8000, true);

      await waiter.waitFor('turn_complete');
      expect(generatePersonaTurn).not.toHaveBeenCalled();
    },
  );

  it(
    'a stray frame arriving after state has already moved on (e.g. network reordering) is silently dropped, not treated as a barge-in — the in-flight turn completes normally, undisturbed',
    async () => {
      const waiter = createMessageWaiter();
      let releaseSynthesis: (() => void) | undefined;
      const { deps, sttHandlers } = fakeDeps(waiter);
      // Override synthesizeSpeech to hang until the test releases it, so the orchestrator is genuinely mid-"speaking" when the stray frame arrives.
      deps.synthesizeSpeech = jest.fn(() => new Promise((resolve) => {
        releaseSynthesis = () => resolve([]);
      }));

      const orchestrator = new TurnOrchestrator(deps);
      speakOneUtterance(orchestrator);
      sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
      await waiter.waitFor('persona_turn'); // proves we're now in the 'speaking' phase, synthesis in flight

      expect(orchestrator.currentState).toBe('speaking');
      // The client's talk button is disabled while she's speaking (PRD
      // §7.9), so this shouldn't happen in practice — this test is the
      // server-side defensive guard for a frame that was already in
      // flight when that transition happened.
      orchestrator.pushAudioFrame(loudFrame(), 'stray-frame', 8000, false);

      expect(waiter.messages.some(message => message.type === 'barge_in')).toBe(false);
      expect(orchestrator.currentState).toBe('speaking'); // undisturbed — not reset to 'listening'

      releaseSynthesis?.(); // the original, never-superseded turn completes normally
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(waiter.messages.some(message => message.type === 'turn_complete')).toBe(true);
    },
  );

  it('forwards STT partial transcripts to the client (PRD §6.2 live "what did I just say" feedback)', () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    orchestrator.pushAudioFrame(loudFrame(), 'loud', 8000, false);
    sttHandlers[0]?.onPartialTranscript?.('Прив');

    expect(waiter.messages).toContainEqual({ type: 'transcript_partial', text: 'Прив' });
  });

  it('a hold pinned open past MAX_HOLD_MS is force-committed server-side — a backstop against a client that never sends commit: true', () => {
    const waiter = createMessageWaiter();
    let clockMs = 0;
    const { deps, sttSendAudioChunk } = fakeDeps(waiter);
    deps.now = () => clockMs;
    const orchestrator = new TurnOrchestrator(deps);

    orchestrator.pushAudioFrame(loudFrame(), 'chunk-1', 8000, false);
    clockMs = 60_000;
    orchestrator.pushAudioFrame(loudFrame(), 'chunk-2', 8000, false); // client still hasn't released

    // Forced commit: true despite the client sending false.
    expect(sttSendAudioChunk).toHaveBeenLastCalledWith('chunk-2', 8000, true);
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('TurnOrchestrator safety escape hatch (ticket #27)', () => {
  it('breaks character entirely on a distress trigger: skips generatePersonaTurn, sends safety_response, still synthesizes real audio', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn, annotateText, synthesizeSpeech } = fakeDeps(waiter, { safetyCategory: 'distress' });
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).not.toHaveBeenCalled();
    // English response text, not Cyrillic — stress annotation is Cyrillic-specific and must not run on it.
    expect(annotateText).not.toHaveBeenCalled();
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);

    const safetyMessage = waiter.messages.find(message => message.type === 'safety_response');
    expect(safetyMessage).toMatchObject({ type: 'safety_response', category: 'distress' });
    expect(waiter.messages.some(message => message.type === 'tts_chunk')).toBe(true);
    expect(waiter.messages.some(message => message.type === 'persona_turn')).toBe(false);
  });

  it('breaks character on a sexualization trigger too — the same layer covers both categories', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter, { safetyCategory: 'sexualization' });
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).not.toHaveBeenCalled();
    const safetyMessage = waiter.messages.find(message => message.type === 'safety_response');
    expect(safetyMessage).toMatchObject({ type: 'safety_response', category: 'sexualization' });
  });

  it('does not add the triggering turn or the safety response to conversation history — the persona pipeline must never see it, on this turn or any later one', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter, { safetyCategory: 'distress' });
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    // A normal follow-up turn: if the trigger had been added to history, it would show up here.
    deps.detectSafetyTrigger = jest.fn(async () => 'none');
    speakOneUtterance(orchestrator);
    sttHandlers[1]?.onFinalTranscript?.({ text: 'Второй вопрос.', words: [goodWord('Второй'), goodWord('вопрос')] });
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, [{ speaker: 'learner', text: 'Второй вопрос.' }]);
  });

  it('does not run generatePersonaTurn or synthesizeSpeech for ordinary conversation ("none")', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter); // default safetyCategory: 'none'
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).toHaveBeenCalledTimes(1);
    expect(waiter.messages.some(message => message.type === 'safety_response')).toBe(false);
  });

  it('audio arriving during a safety response\'s TTS is silently ignored, same as any other "speaking" turn — no spurious barge_in, the safety response completes normally', async () => {
    const waiter = createMessageWaiter();
    let releaseSynthesis: (() => void) | undefined;
    const { deps, sttHandlers } = fakeDeps(waiter, { safetyCategory: 'distress' });
    deps.synthesizeSpeech = jest.fn(() => new Promise((resolve) => {
      releaseSynthesis = () => resolve([]);
    }));

    const orchestrator = new TurnOrchestrator(deps);
    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('safety_response');

    expect(orchestrator.currentState).toBe('speaking');
    orchestrator.pushAudioFrame(loudFrame(), 'stray-frame', 8000, false);

    expect(waiter.messages.some(message => message.type === 'barge_in')).toBe(false);
    expect(orchestrator.currentState).toBe('speaking');

    releaseSynthesis?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(waiter.messages.some(message => message.type === 'turn_complete')).toBe(true);
  });

  it('skips the safety check entirely for an empty transcript — nothing to classify', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, detectSafetyTrigger } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.({ text: '', words: [] });
    await waiter.waitFor('turn_complete');

    expect(detectSafetyTrigger).not.toHaveBeenCalled();
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('TurnOrchestrator text input (ticket #32)', () => {
  it('runs the exact same cascade as voice: filler -> transcript_final -> persona_turn -> tts_chunk -> turn_complete, with no low-confidence check anywhere in it', async () => {
    const waiter = createMessageWaiter();
    const { deps, generatePersonaTurn, annotateText, synthesizeSpeech } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    await orchestrator.submitTextInput('Привет, как дела?');

    expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, [{ speaker: 'learner', text: 'Привет, как дела?' }]);
    expect(annotateText).toHaveBeenCalledWith('Ах, конечно.');
    expect(synthesizeSpeech).toHaveBeenCalledWith(deps.elevenLabsClient, 'voice-123', 'Ах, конечно.[annotated]', expect.any(Object));

    const types = waiter.messages.map(message => message.type);
    expect(types).toEqual(['persona_filler', 'transcript_final', 'persona_turn', 'tts_chunk', 'turn_complete']);
    expect(waiter.messages).toContainEqual({ type: 'transcript_final', text: 'Привет, как дела?' });
  });

  it('shares real conversation history with the voice path — a text turn followed by a voice turn sees the text turn in its own history, and vice versa', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    await orchestrator.submitTextInput('Текстовое сообщение.');
    // Marks the text turn's own turn_complete as claimed, so the waitFor below genuinely waits
    // for the voice turn's (otherwise it immediately resolves against this leftover instead —
    // the same class of bug already found and fixed once in this file's own message waiter).
    await waiter.waitFor('turn_complete');

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).toHaveBeenLastCalledWith(deps.anthropicClient, [
      { speaker: 'learner', text: 'Текстовое сообщение.' },
      { speaker: 'persona', text: 'Ах, конечно.' },
      { speaker: 'learner', text: goodTranscript.text },
    ]);
  });

  it('runs the safety check on typed text too, and breaks character the same way voice input does — same layer, per AC #3', async () => {
    const waiter = createMessageWaiter();
    const { deps, generatePersonaTurn } = fakeDeps(waiter, { safetyCategory: 'distress' });
    const orchestrator = new TurnOrchestrator(deps);

    await orchestrator.submitTextInput('some distress-signaling typed message');

    expect(generatePersonaTurn).not.toHaveBeenCalled();
    const safetyMessage = waiter.messages.find(message => message.type === 'safety_response');
    expect(safetyMessage).toMatchObject({ type: 'safety_response', category: 'distress' });
  });

  it('is a no-op for empty or whitespace-only text', async () => {
    const waiter = createMessageWaiter();
    const { deps, generatePersonaTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    await orchestrator.submitTextInput('');
    await orchestrator.submitTextInput('   ');

    expect(generatePersonaTurn).not.toHaveBeenCalled();
    expect(waiter.messages).toEqual([]);
  });

  it('typing while she is still speaking interrupts her — sends barge_in, the same as speaking over her in voice mode', async () => {
    const waiter = createMessageWaiter();
    let releaseSynthesis: (() => void) | undefined;
    const { deps } = fakeDeps(waiter);
    deps.synthesizeSpeech = jest.fn(() => new Promise((resolve) => {
      releaseSynthesis = () => resolve([]);
    }));

    const orchestrator = new TurnOrchestrator(deps);
    void orchestrator.submitTextInput('Первое сообщение.');
    await waiter.waitFor('persona_turn'); // now genuinely 'speaking', synthesis in flight

    expect(orchestrator.currentState).toBe('speaking');
    // Not awaited: handleBargeIn runs synchronously at the top of submitTextInput, before any
    // await point, so barge_in is already sent by the time this call returns control — awaiting
    // the whole call here would hang on the second turn's own (also-stubbed) synthesizeSpeech.
    const secondTurn = orchestrator.submitTextInput('Перебиваю.');

    expect(waiter.messages.some(message => message.type === 'barge_in')).toBe(true);

    // Waits for the second turn's own persona_turn (not the first's, already consumed above) —
    // proves the second call has reached its own synthesizeSpeech, so releaseSynthesis now
    // resolves *that* call's promise, not the superseded first turn's.
    await waiter.waitFor('persona_turn');
    releaseSynthesis?.();
    await secondTurn;
    // Only the second turn's completion should ever land — the first turn was superseded.
    const turnCompleteCount = waiter.messages.filter(message => message.type === 'turn_complete').length;
    expect(turnCompleteCount).toBe(1);
  });
});

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('TurnOrchestrator observability (ticket #29)', () => {
  it('does not call recordTurn at all before sessionStart has been called — nothing to attribute a turn to yet', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, recordTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    expect(recordTurn).not.toHaveBeenCalled();
  });

  it('after sessionStart, records the learner turn and the persona turn with the real session id, register, timings, and cost', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, recordTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    expect(recordTurn).toHaveBeenCalledWith('session-abc', expect.objectContaining({ speaker: 'learner', content: goodTranscript.text, learnerRegister: 'vy' }));
    expect(recordTurn).toHaveBeenCalledWith('session-abc', expect.objectContaining({
      speaker: 'persona',
      content: 'Ах, конечно.',
      personaRegister: 'ty',
      timings: expect.objectContaining({ t0TurnDetected: expect.any(Number), t5FirstAudio: expect.any(Number) }),
      costUsd: expect.any(Number),
    }));
  });

  it('a barge-in mid-speech calls recordInterruption with the real persona turn id and the elapsed ms since her audio started', async () => {
    const waiter = createMessageWaiter();
    let releaseSynthesis: (() => void) | undefined;
    const { deps, sttHandlers, recordTurn, recordInterruption } = fakeDeps(waiter);
    // Fires onChunk immediately (her audio "starts" right away, matching how t5FirstAudio is defined) but then hangs — giving the test a window, still mid-synthesis, to push a barge-in.
    deps.synthesizeSpeech = jest.fn((_client, _voiceId, _text, handlers) => {
      handlers?.onChunk?.({ audioBase64: 'chunk-0' } as never, 0);
      return new Promise((resolve) => {
        releaseSynthesis = () => resolve([]);
      });
    });

    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');
    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('tts_chunk'); // proves onChunk (and thus the synchronous recordPersonaTurn call inside it) has already run

    // recordTurn's own promise for that call was attached to *before* this test can reach it — awaiting it here guarantees production's own .then() (which fills in the real turn id) has already run too, since same-promise .then() handlers fire in attachment order.
    const personaCallIndex = recordTurn.mock.calls.findIndex(call => (call[1] as { speaker: string }).speaker === 'persona');
    const turnId = await recordTurn.mock.results[personaCallIndex]?.value;
    expect(orchestrator.currentState).toBe('speaking');
    // Claims the original turn's own persona_turn occurrence — only
    // `tts_chunk` was awaited for it above, so without this the later
    // `waitFor('persona_turn')` below would resolve against *this*
    // still-unclaimed occurrence instead of the interrupting turn's.
    await waiter.waitFor('persona_turn');

    // Voice can no longer trigger a barge-in here (see pushAudioFrame's own
    // comment: the mic's own echo of her TTS used to be indistinguishable
    // from a real interruption) — text input is the only remaining barge-in
    // trigger, same mechanism (`handleBargeIn`/`recordInterruptionIfAny`)
    // either way. Not awaited: `handleBargeIn` runs synchronously before
    // any await point in `submitTextInput` — awaiting the whole call here
    // would hang on the interrupting turn's own (also-stubbed)
    // synthesizeSpeech, same reasoning as the text-input barge-in test above.
    const interrupting = orchestrator.submitTextInput('Перебиваю.');

    expect(waiter.messages.some(message => message.type === 'barge_in')).toBe(true);
    expect(recordInterruption).toHaveBeenCalledWith(turnId, expect.any(Number));

    // Waits for the interrupting turn's own persona_turn — proves
    // `releaseSynthesis` now points to *that* call's resolver, not the
    // superseded original turn's (which is simply left hanging — nothing
    // here awaits it directly).
    await waiter.waitFor('persona_turn');
    releaseSynthesis?.();
    await interrupting;
  });

  it('does not record a barge-in that lands before her audio has actually started (still fetching the first TTS chunk)', async () => {
    const waiter = createMessageWaiter();
    let releaseSynthesis: (() => void) | undefined;
    const { deps, sttHandlers, recordInterruption } = fakeDeps(waiter);
    // Never calls onChunk before releaseSynthesis — mirrors the pre-existing barge-in test's own fixture, but this test asserts on the observability side.
    deps.synthesizeSpeech = jest.fn(() => new Promise((resolve) => {
      releaseSynthesis = () => resolve([]);
    }));

    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');
    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('persona_turn'); // proves we're in 'speaking', still before any chunk

    // Voice can no longer trigger a barge-in (see pushAudioFrame's own
    // comment) — text input is the only remaining trigger, same
    // `handleBargeIn` either way. Not awaited: its own synthesizeSpeech
    // call would hang on this test's shared stub.
    void orchestrator.submitTextInput('Перебиваю.');

    expect(recordInterruption).not.toHaveBeenCalled();
    releaseSynthesis?.();
  });

  it('a barge-in during a safety response never misattributes to a stale earlier persona turn', async () => {
    const waiter = createMessageWaiter();
    let releaseFirstSynthesis: (() => void) | undefined;
    const { deps, sttHandlers, recordInterruption } = fakeDeps(waiter, { safetyCategory: 'none' });

    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');

    // A normal completed persona turn first — sets a real lastPersonaTurn.
    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    // Now a safety-triggering turn, whose own synthesis hangs mid-flight.
    deps.detectSafetyTrigger = jest.fn(async () => 'distress');
    deps.synthesizeSpeech = jest.fn(() => new Promise((resolve) => {
      releaseFirstSynthesis = () => resolve([]);
    }));
    speakOneUtterance(orchestrator);
    sttHandlers[1]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('safety_response');

    void orchestrator.submitTextInput('Перебиваю.');

    // Must not fire against the earlier, already-completed normal turn.
    expect(recordInterruption).not.toHaveBeenCalled();
    releaseFirstSynthesis?.();
  });

  it('the "didn\'t catch that" path (low STT confidence) records both the learner\'s real transcript and the fixed persona line', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, recordTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');

    speakOneUtterance(orchestrator);
    // See the "responds with the 'didn't catch that' line" test's own comment for why -7/-8, not the old -4/-5.
    sttHandlers[0]?.onFinalTranscript?.({ text: 'мумбл мумбл', words: [goodWord('мумбл', -7), goodWord('мумбл', -8)] });
    await waiter.waitFor('turn_complete');

    expect(recordTurn).toHaveBeenCalledWith('session-abc', expect.objectContaining({ speaker: 'learner', content: 'мумбл мумбл' }));
    expect(recordTurn).toHaveBeenCalledWith('session-abc', expect.objectContaining({ speaker: 'persona', content: expect.stringContaining('поняла') }));
  });

  it('the "didn\'t catch that" path records only the persona line, no learner turn, when the STT vendor errors outright — there is no transcript to record', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, recordTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onError?.(new Error('vendor unavailable'));
    await waiter.waitFor('turn_complete');

    expect(recordTurn).toHaveBeenCalledTimes(1);
    expect(recordTurn).toHaveBeenCalledWith('session-abc', expect.objectContaining({ speaker: 'persona' }));
  });

  it('the safety-response path (ticket #27) never calls recordTurn at all — a deliberate, disclosed scope narrowing (docs/adr/0022)', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, recordTurn } = fakeDeps(waiter, { safetyCategory: 'distress' });
    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    expect(recordTurn).not.toHaveBeenCalled();
  });

  it('the text-input path (ticket #32) records the learner turn with zero STT cost — no STT stage ran for typed text', async () => {
    const waiter = createMessageWaiter();
    const { deps, recordTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');

    await orchestrator.submitTextInput('Привет, как дела?');

    expect(recordTurn).toHaveBeenCalledWith('session-abc', expect.objectContaining({ speaker: 'learner', content: 'Привет, как дела?', costUsd: 0 }));
  });

  it('a recordTurn failure is logged and swallowed — never affects the live pipeline (ARCHITECTURE.md: "Voice has zero DB mid-turn")', async () => {
    const waiter = createMessageWaiter();
    const { deps } = fakeDeps(waiter);
    deps.recordTurn = jest.fn(async () => {
      throw new Error('app-service unreachable');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');

    await orchestrator.submitTextInput('Привет, как дела?');
    await new Promise(resolve => setTimeout(resolve, 0)); // let the rejected recordTurn promise's .catch run

    expect(waiter.messages.some(message => message.type === 'turn_complete')).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// Sibling describe, not nested inside the top-level one above — keeps this
// file's per-describe test count from growing unbounded as coverage accretes.
describe('TurnOrchestrator opening line (PRD §6.2: "she opens, not the learner")', () => {
  it('sends a filler, then a persona_turn and tts_chunk(s), then turn_complete — with no preceding learner turn', async () => {
    const waiter = createMessageWaiter();
    const { deps, generatePersonaTurn, synthesizeSpeech } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    await orchestrator.openConversation();

    expect(waiter.messages[0]).toMatchObject({ type: 'persona_filler' });
    const personaTurn = waiter.messages.find(message => message.type === 'persona_turn');
    // translation: PRD §6.2 tap-to-reveal — the opening line is fixed copy, not LLM-generated,
    // so its translation must be too (OPENING_LINE_TRANSLATION), same reasoning as the line itself.
    expect(personaTurn).toMatchObject({ type: 'persona_turn', comprehension: 'understood', affect: 'warm', translation: expect.any(String) });
    expect(waiter.messages.some(message => message.type === 'tts_chunk')).toBe(true);
    expect(waiter.messages.some(message => message.type === 'turn_complete')).toBe(true);
    // No LLM call for a fixed opening line, and nothing to have generated it from anyway.
    expect(generatePersonaTurn).not.toHaveBeenCalled();
    expect(synthesizeSpeech).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining('[annotated]'), expect.anything());
  });

  it(
    'does not add the opening line to history — the learner\'s first real turn is still the only, and first, message sent to the persona LLM',
    async () => {
      // Anthropic's Messages API requires the first message in a request to
      // be role 'user'. this.history feeds toMessageParams (persona.ts),
      // which maps speaker 'persona' -> role 'assistant'. If the opening
      // line were pushed onto history, it would be the first (and, until
      // now, only) entry, making this call structurally invalid.
      const waiter = createMessageWaiter();
      const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter);
      const orchestrator = new TurnOrchestrator(deps);

      await orchestrator.openConversation();
      await waiter.waitFor('turn_complete'); // the opening line's own turn_complete — consume it before waiting for the real turn's
      speakOneUtterance(orchestrator);
      sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
      await waiter.waitFor('turn_complete');

      expect(generatePersonaTurn).toHaveBeenCalledWith(expect.anything(), [{ speaker: 'learner', text: goodTranscript.text }]);
    },
  );

  it('records the opening line via recordTurn once session id is set, with zero LLM usage and a real TTS character count', async () => {
    const waiter = createMessageWaiter();
    const { deps, recordTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');

    await orchestrator.openConversation();

    expect(recordTurn).toHaveBeenCalledWith('session-abc', expect.objectContaining({
      speaker: 'persona',
      costUsd: expect.any(Number),
    }));
  });

  it('a stray frame arriving while she is still opening is silently ignored, not a barge-in; the opening line completes normally', async () => {
    const waiter = createMessageWaiter();
    let releaseSynthesis: (() => void) | undefined;
    const { deps } = fakeDeps(waiter);
    deps.synthesizeSpeech = jest.fn((_client, _voiceId, _text, handlers) => {
      handlers?.onChunk?.({ audioBase64: 'chunk-0' } as never, 0);
      return new Promise((resolve) => {
        releaseSynthesis = () => resolve([]);
      });
    });
    const orchestrator = new TurnOrchestrator(deps);

    const opening = orchestrator.openConversation();
    await waiter.waitFor('tts_chunk');
    expect(orchestrator.currentState).toBe('speaking');

    // The client's talk button is disabled while she's speaking — this
    // tests the server-side defensive guard for a frame already in
    // flight when that transition happened, not a real client scenario.
    orchestrator.pushAudioFrame(loudFrame(), 'stray-frame', 8000, false);
    expect(waiter.messages.some(message => message.type === 'barge_in')).toBe(false);
    expect(orchestrator.currentState).toBe('speaking');

    releaseSynthesis?.();
    await opening;
    expect(waiter.messages.filter(message => message.type === 'turn_complete')).toHaveLength(1);
  });
});
