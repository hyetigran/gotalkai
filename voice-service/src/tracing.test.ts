import { buildTurnSpans, logTrace } from './tracing';

const TIMINGS = { t0TurnDetected: 0, t1SttFinal: 100, t2PersonaStart: 100, t3PersonaComplete: 400, t4StressAnnotated: 420, t5FirstAudio: 700 };

describe('buildTurnSpans', () => {
  it('derives four child spans with offsets and durations matching the six-timestamp log', () => {
    expect(buildTurnSpans(TIMINGS)).toEqual([
      { name: 'stt', startOffsetMs: 0, durationMs: 100 },
      { name: 'persona_llm', startOffsetMs: 100, durationMs: 300 },
      { name: 'stress_annotation', startOffsetMs: 400, durationMs: 20 },
      { name: 'tts_first_audio', startOffsetMs: 420, durationMs: 280 },
    ]);
  });
});

describe('logTrace', () => {
  it('logs one structured [trace] line carrying sessionId, turnId, and the built spans', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logTrace('session-1', 'turn-1', TIMINGS);

    expect(logSpy).toHaveBeenCalledWith('[trace]', { sessionId: 'session-1', turnId: 'turn-1', spans: buildTurnSpans(TIMINGS) });
    logSpy.mockRestore();
  });
});
