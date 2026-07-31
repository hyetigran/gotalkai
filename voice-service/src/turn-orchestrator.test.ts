import type Anthropic from '@anthropic-ai/sdk';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { ServerMessage } from './messages';
import type { GeneratePersonaTurnResult } from './persona-turn';
import { PERSONA_DEFINITIONS } from './personas';
import type { PersonaDefinition } from './personas';
import type { SafetyCategory } from './safety-detection';
import type { SttEventHandlers, SttTranscript, SttWord } from './stt';
import type { TtsEventHandlers } from './tts';
import { type RecordedTurnInput, TurnOrchestrator, type TurnOrchestratorDeps } from './turn-orchestrator';

function silentFrame(length = 160): Int16Array {
  return new Int16Array(length);
}

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
  const generatePersonaTurn = jest.fn(async (_client: Anthropic, _transcript: unknown, _persona: PersonaDefinition): Promise<GeneratePersonaTurnResult> =>
    options.personaTurn ?? { turn: { comprehension: 'understood', affect: 'warm', text: 'Ах, конечно.' }, fellBackToFiller: false, rawOutput: '', usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } });
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
    persona: PERSONA_DEFINITIONS.valentina,
    voiceId: 'voice-123',
    sendMessage: waiter.sendMessage,
    recordTurn,
    recordInterruption,
    now: () => clock++,
    vadConfig: { speechThresholdRms: 5000, silenceHangoverMs: 40 },
  };

  return { deps, sttHandlers, sttSendAudioChunk, sttClose, generatePersonaTurn, detectSafetyTrigger, annotateText, synthesizeSpeech, recordTurn, recordInterruption };
}

/** Pushes one loud frame (starts speech) then enough silent frames to cross the 40ms hangover — the standard "learner spoke one utterance" sequence for these tests. */
function speakOneUtterance(orchestrator: TurnOrchestrator): void {
  orchestrator.pushAudioFrame(loudFrame(), 'loud-base64', 8000);
  orchestrator.pushAudioFrame(silentFrame(), 'silent-1', 8000); // 20ms
  orchestrator.pushAudioFrame(silentFrame(), 'silent-2', 8000); // 40ms — crosses hangover, triggers commit
}

const goodTranscript: SttTranscript = { text: 'Привет, как дела?', words: [goodWord('Привет'), goodWord('как'), goodWord('дела')] };

describe('TurnOrchestrator', () => {
  it('opens an STT session on speech start and forwards audio while in speech', () => {
    const waiter = createMessageWaiter();
    const { deps, sttSendAudioChunk } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    orchestrator.pushAudioFrame(loudFrame(), 'loud-base64', 8000);

    expect(deps.createSttSession).toHaveBeenCalledTimes(1);
    expect(sttSendAudioChunk).toHaveBeenCalledWith('loud-base64', 8000, false);
  });

  it('does not open an STT session or forward anything while silence continues', () => {
    const waiter = createMessageWaiter();
    const { deps, sttSendAudioChunk } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    orchestrator.pushAudioFrame(silentFrame(), 'silent', 8000);

    expect(deps.createSttSession).not.toHaveBeenCalled();
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

      expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, [{ speaker: 'learner', text: goodTranscript.text }], deps.persona);
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
    ], deps.persona);
  });

  it(
    'responds with the "didn\'t catch that" line and skips the LLM/TTS entirely when STT confidence is low (PRD §5.7 mechanic)',
    async () => {
      const waiter = createMessageWaiter();
      const { deps, sttHandlers, generatePersonaTurn, synthesizeSpeech } = fakeDeps(waiter);
      const orchestrator = new TurnOrchestrator(deps);

      speakOneUtterance(orchestrator);
      sttHandlers[0]?.onFinalTranscript?.({ text: 'мумбл мумбл', words: [goodWord('мумбл', -4), goodWord('мумбл', -5)] });
      await waiter.waitFor('turn_complete');

      expect(generatePersonaTurn).not.toHaveBeenCalled();
      expect(synthesizeSpeech).not.toHaveBeenCalled();
      const personaTurnMessage = waiter.messages.find(message => message.type === 'persona_turn');
      expect(personaTurnMessage).toMatchObject({ type: 'persona_turn', comprehension: 'not_understood' });
      // Even on the low-confidence path, PRD §6.2 wants "what she heard" shown — not just her not-understood reply.
      expect(waiter.messages).toContainEqual({ type: 'transcript_final', text: 'мумбл мумбл' });
    },
  );

  it('treats an empty transcript (no words at all) as low confidence too, not a crash', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.({ text: '', words: [] });
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).not.toHaveBeenCalled();
  });

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
    'a barge-in (new speech while speaking) sends barge_in, resets state, and drops the abandoned turn\'s results — no stale tts_chunk/turn_complete for the interrupted turn',
    async () => {
      const waiter = createMessageWaiter();
      let releaseSynthesis: (() => void) | undefined;
      const { deps, sttHandlers } = fakeDeps(waiter);
      // Override synthesizeSpeech to hang until the test releases it, so the orchestrator is genuinely mid-"speaking" when the barge-in frame arrives.
      deps.synthesizeSpeech = jest.fn(() => new Promise((resolve) => {
        releaseSynthesis = () => resolve([]);
      }));

      const orchestrator = new TurnOrchestrator(deps);
      speakOneUtterance(orchestrator);
      sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
      await waiter.waitFor('persona_turn'); // proves we're now in the 'speaking' phase, synthesis in flight

      expect(orchestrator.currentState).toBe('speaking');
      orchestrator.pushAudioFrame(loudFrame(), 'barge-in-audio', 8000); // learner speaks over her

      expect(waiter.messages.some(message => message.type === 'barge_in')).toBe(true);
      expect(orchestrator.currentState).toBe('listening');

      releaseSynthesis?.(); // let the abandoned turn's synthesis "complete" now
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(waiter.messages.some(message => message.type === 'turn_complete')).toBe(false); // superseded, never sent
    },
  );

  it('while held, incoming audio is entirely ignored — no STT session, no messages, matching "no audio sent to STT" (PRD §7.9)', () => {
    const waiter = createMessageWaiter();
    const { deps } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    orchestrator.holdStart();
    orchestrator.pushAudioFrame(loudFrame(), 'loud', 8000);

    expect(deps.createSttSession).not.toHaveBeenCalled();
    expect(waiter.messages).toEqual([]);
  });

  it('resumes normal processing after holdEnd', () => {
    const waiter = createMessageWaiter();
    const { deps } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    orchestrator.holdStart();
    orchestrator.holdEnd();
    orchestrator.pushAudioFrame(loudFrame(), 'loud', 8000);

    expect(deps.createSttSession).toHaveBeenCalledTimes(1);
  });

  it('auto-releases a hold after ~45s if hold_end never arrives — a server-side backstop for a dropped/crashed client (PRD §7.9)', () => {
    jest.useFakeTimers();
    try {
      const waiter = createMessageWaiter();
      const { deps } = fakeDeps(waiter);
      const orchestrator = new TurnOrchestrator(deps);

      orchestrator.holdStart();
      orchestrator.pushAudioFrame(loudFrame(), 'loud', 8000);
      expect(deps.createSttSession).not.toHaveBeenCalled(); // still held

      jest.advanceTimersByTime(45_000);
      orchestrator.pushAudioFrame(loudFrame(), 'loud-after-release', 8000);
      expect(deps.createSttSession).toHaveBeenCalledTimes(1); // auto-released, now processes audio
    }
    finally {
      jest.useRealTimers();
    }
  });

  it('an explicit holdEnd before the 45s backstop cancels it — no late, spurious auto-release', () => {
    jest.useFakeTimers();
    try {
      const waiter = createMessageWaiter();
      const { deps } = fakeDeps(waiter);
      const orchestrator = new TurnOrchestrator(deps);

      orchestrator.holdStart();
      orchestrator.holdEnd();
      orchestrator.holdStart(); // hold again, well within the first backstop's original window
      jest.advanceTimersByTime(20_000);
      orchestrator.holdEnd();
      jest.advanceTimersByTime(30_000); // past the original (cancelled) 45s deadline

      orchestrator.pushAudioFrame(loudFrame(), 'loud', 8000);
      expect(deps.createSttSession).toHaveBeenCalledTimes(1); // not held — the stale timer never fired
    }
    finally {
      jest.useRealTimers();
    }
  });

  it('forwards STT partial transcripts to the client (PRD §6.2 live "what did I just say" feedback)', () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    orchestrator.pushAudioFrame(loudFrame(), 'loud', 8000);
    sttHandlers[0]?.onPartialTranscript?.('Прив');

    expect(waiter.messages).toContainEqual({ type: 'transcript_partial', text: 'Прив' });
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

    expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, [{ speaker: 'learner', text: 'Второй вопрос.' }], deps.persona);
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

  it('a barge-in during a safety response is handled the same as any other turn — no stale safety_response/turn_complete for the abandoned turn', async () => {
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
    orchestrator.pushAudioFrame(loudFrame(), 'barge-in-audio', 8000);

    expect(waiter.messages.some(message => message.type === 'barge_in')).toBe(true);
    expect(orchestrator.currentState).toBe('listening');

    releaseSynthesis?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(waiter.messages.some(message => message.type === 'turn_complete')).toBe(false); // superseded, never sent
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

    expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, [{ speaker: 'learner', text: 'Привет, как дела?' }], deps.persona);
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
    ], deps.persona);
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

  it('is a no-op while held, matching PRD §7.9\'s "turn detection is suspended entirely" for any input modality', async () => {
    const waiter = createMessageWaiter();
    const { deps, generatePersonaTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    orchestrator.holdStart();
    await orchestrator.submitTextInput('should be ignored while held');

    expect(generatePersonaTurn).not.toHaveBeenCalled();
    expect(waiter.messages).toEqual([]);
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

    orchestrator.pushAudioFrame(loudFrame(), 'barge-in-audio', 8000);

    expect(waiter.messages.some(message => message.type === 'barge_in')).toBe(true);
    expect(recordInterruption).toHaveBeenCalledWith(turnId, expect.any(Number));

    releaseSynthesis?.();
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

    orchestrator.pushAudioFrame(loudFrame(), 'barge-in-audio', 8000);

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

    orchestrator.pushAudioFrame(loudFrame(), 'barge-in-audio', 8000);

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
    sttHandlers[0]?.onFinalTranscript?.({ text: 'мумбл мумбл', words: [goodWord('мумбл', -4), goodWord('мумбл', -5)] });
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

// Sibling describe, not nested — keeps each describe callback under the max-lines-per-function limit.
describe('TurnOrchestrator persona selection (ticket #34)', () => {
  it('defaults to the connection-time persona (Валентина in production) when selectPersona is never called — AC #1: existing behavior unaffected', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn, synthesizeSpeech } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, expect.any(Array), PERSONA_DEFINITIONS.valentina);
    expect(synthesizeSpeech).toHaveBeenCalledWith(deps.elevenLabsClient, 'voice-123', expect.any(String), expect.any(Object));
  });

  it('selectPersona swaps the active persona, register, and voice id before the next turn runs', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn, synthesizeSpeech, recordTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.sessionStart('session-abc');
    orchestrator.selectPersona(PERSONA_DEFINITIONS.elena, 'elena-voice-id');

    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');

    expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, expect.any(Array), PERSONA_DEFINITIONS.elena);
    expect(synthesizeSpeech).toHaveBeenCalledWith(deps.elevenLabsClient, 'elena-voice-id', expect.any(String), expect.any(Object));
    expect(recordTurn).toHaveBeenCalledWith('session-abc', expect.objectContaining({ speaker: 'learner', learnerRegister: PERSONA_DEFINITIONS.elena.learnerRegister }));
    expect(recordTurn).toHaveBeenCalledWith('session-abc', expect.objectContaining({ speaker: 'persona', personaRegister: PERSONA_DEFINITIONS.elena.personaRegister }));
  });

  it('selectPersona before any turn means even the first turn of the session uses the newly selected persona, not the connection default', async () => {
    const waiter = createMessageWaiter();
    const { deps, sttHandlers, generatePersonaTurn } = fakeDeps(waiter);
    const orchestrator = new TurnOrchestrator(deps);
    orchestrator.selectPersona(PERSONA_DEFINITIONS.elena, 'elena-voice-id');

    await orchestrator.submitTextInput('Здравствуйте!');

    expect(generatePersonaTurn).toHaveBeenCalledWith(deps.anthropicClient, [{ speaker: 'learner', text: 'Здравствуйте!' }], PERSONA_DEFINITIONS.elena);

    // Second, unrelated assertion folded in here rather than a separate test: confirms the STT-triggered
    // path also picks up the switched persona, not just the text-input path exercised above.
    speakOneUtterance(orchestrator);
    sttHandlers[0]?.onFinalTranscript?.(goodTranscript);
    await waiter.waitFor('turn_complete');
    expect(generatePersonaTurn).toHaveBeenLastCalledWith(deps.anthropicClient, expect.any(Array), PERSONA_DEFINITIONS.elena);
  });
});
