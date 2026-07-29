import type Anthropic from '@anthropic-ai/sdk';
import type { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { ServerMessage } from './messages';
import type { GeneratePersonaTurnResult } from './persona-turn';
import type { SttEventHandlers, SttTranscript, SttWord } from './stt';
import type { TtsEventHandlers } from './tts';
import { TurnOrchestrator, type TurnOrchestratorDeps } from './turn-orchestrator';

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

/** Waits for a specific message type to have been sent, regardless of how many async hops it takes to get there — robust against the orchestrator's internal await chain length. */
function createMessageWaiter() {
  const messages: ServerMessage[] = [];
  const waiters = new Map<string, () => void>();
  const sendMessage = (message: ServerMessage): void => {
    messages.push(message);
    const waiter = waiters.get(message.type);
    if (waiter) {
      waiters.delete(message.type);
      waiter();
    }
  };
  const waitFor = (type: ServerMessage['type']): Promise<void> => {
    if (messages.some(message => message.type === type))
      return Promise.resolve();
    return new Promise((resolve) => {
      waiters.set(type, resolve);
    });
  };
  return { messages, sendMessage, waitFor };
}

type FakeDepsOptions = {
  personaTurn?: GeneratePersonaTurnResult;
  ttsChunks?: number;
};

function fakeDeps(waiter: ReturnType<typeof createMessageWaiter>, options: FakeDepsOptions = {}) {
  const sttHandlers: SttEventHandlers[] = [];
  const sttSendAudioChunk = jest.fn();
  const sttClose = jest.fn();
  const generatePersonaTurn = jest.fn(async (): Promise<GeneratePersonaTurnResult> =>
    options.personaTurn ?? { turn: { comprehension: 'understood', affect: 'warm', text: 'Ах, конечно.' }, fellBackToFiller: false, rawOutput: '' });
  const annotateText = jest.fn((text: string) => ({ text: `${text}[annotated]`, unresolvedWords: [] }));
  const synthesizeSpeech = jest.fn(async (_client: unknown, _voiceId: string, _text: string, handlers?: TtsEventHandlers) => {
    const chunkCount = options.ttsChunks ?? 1;
    for (let i = 0; i < chunkCount; i++) handlers?.onChunk?.({ audioBase64: `chunk-${i}` } as never, i);
    return [];
  });
  let clock = 0;

  const deps: TurnOrchestratorDeps = {
    createSttSession: jest.fn((_apiKey: string, handlers: SttEventHandlers) => {
      sttHandlers.push(handlers);
      return { sendAudioChunk: sttSendAudioChunk, close: sttClose };
    }),
    generatePersonaTurn,
    annotateText,
    synthesizeSpeech,
    anthropicClient: {} as Anthropic,
    elevenLabsClient: {} as ElevenLabsClient,
    elevenLabsApiKey: 'test-key',
    voiceId: 'voice-123',
    sendMessage: waiter.sendMessage,
    now: () => clock++,
    vadConfig: { speechThresholdRms: 5000, silenceHangoverMs: 40 },
  };

  return { deps, sttHandlers, sttSendAudioChunk, sttClose, generatePersonaTurn, annotateText, synthesizeSpeech };
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
