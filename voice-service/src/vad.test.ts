import { computeRmsEnergy, VadGate } from './vad';

function silentFrame(length = 160): Int16Array {
  return new Int16Array(length); // all zeros
}

function loudFrame(length = 160, amplitude = 20000): Int16Array {
  // A synthetic "speech-like" frame: alternating +amplitude/-amplitude,
  // not a real voice sample, but real, non-trivial signal energy —
  // enough to exercise computeRmsEnergy/VadGate honestly without
  // needing an actual recorded utterance.
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) samples[i] = i % 2 === 0 ? amplitude : -amplitude;
  return samples;
}

describe('computeRmsEnergy', () => {
  it('is zero for silence', () => {
    expect(computeRmsEnergy(silentFrame())).toBe(0);
  });

  it('is a positive number proportional to amplitude for a loud frame', () => {
    const quiet = computeRmsEnergy(loudFrame(160, 1000));
    const loud = computeRmsEnergy(loudFrame(160, 20000));
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
  });

  it('handles an empty frame without dividing by zero', () => {
    expect(computeRmsEnergy(new Int16Array(0))).toBe(0);
  });
});

describe('VadGate', () => {
  const FRAME_MS = 20;

  it('starts in silence', () => {
    const gate = new VadGate({ speechThresholdRms: 5000, silenceHangoverMs: 300 });
    expect(gate.currentState).toBe('silence');
  });

  it('transitions to speech immediately on the first loud frame — no delay on start', () => {
    const gate = new VadGate({ speechThresholdRms: 5000, silenceHangoverMs: 300 });
    const transition = gate.pushFrame(computeRmsEnergy(loudFrame()), FRAME_MS);
    expect(transition).toBe('speech_start');
    expect(gate.currentState).toBe('speech');
  });

  it('does not transition on continued silence', () => {
    const gate = new VadGate({ speechThresholdRms: 5000, silenceHangoverMs: 300 });
    expect(gate.pushFrame(computeRmsEnergy(silentFrame()), FRAME_MS)).toBeNull();
    expect(gate.currentState).toBe('silence');
  });

  it('does not end speech on a single brief sub-threshold frame — hangover absorbs short pauses', () => {
    const gate = new VadGate({ speechThresholdRms: 5000, silenceHangoverMs: 300 });
    gate.pushFrame(computeRmsEnergy(loudFrame()), FRAME_MS);
    const transition = gate.pushFrame(computeRmsEnergy(silentFrame()), FRAME_MS); // only 20ms of silence, hangover is 300ms
    expect(transition).toBeNull();
    expect(gate.currentState).toBe('speech');
  });

  it('ends speech only once sustained silence reaches the hangover duration', () => {
    const gate = new VadGate({ speechThresholdRms: 5000, silenceHangoverMs: 300 });
    gate.pushFrame(computeRmsEnergy(loudFrame()), FRAME_MS);
    // 14 frames * 20ms = 280ms, still under the 300ms hangover.
    for (let i = 0; i < 14; i++) expect(gate.pushFrame(computeRmsEnergy(silentFrame()), FRAME_MS)).toBeNull();
    expect(gate.currentState).toBe('speech');
    // The 15th frame crosses 300ms.
    expect(gate.pushFrame(computeRmsEnergy(silentFrame()), FRAME_MS)).toBe('speech_end');
    expect(gate.currentState).toBe('silence');
  });

  it('resets the hangover countdown if speech resumes before the hangover completes', () => {
    const gate = new VadGate({ speechThresholdRms: 5000, silenceHangoverMs: 300 });
    gate.pushFrame(computeRmsEnergy(loudFrame()), FRAME_MS);
    for (let i = 0; i < 10; i++) gate.pushFrame(computeRmsEnergy(silentFrame()), FRAME_MS); // 200ms silence, under hangover
    expect(gate.pushFrame(computeRmsEnergy(loudFrame()), FRAME_MS)).toBeNull(); // still 'speech', no re-transition
    expect(gate.currentState).toBe('speech');
    // Silence again — should take the full 300ms again, not pick up where it left off.
    for (let i = 0; i < 14; i++) expect(gate.pushFrame(computeRmsEnergy(silentFrame()), FRAME_MS)).toBeNull();
    expect(gate.currentState).toBe('speech');
    expect(gate.pushFrame(computeRmsEnergy(silentFrame()), FRAME_MS)).toBe('speech_end');
  });

  it('can start a new speech segment after ending a previous one', () => {
    const gate = new VadGate({ speechThresholdRms: 5000, silenceHangoverMs: 300 });
    gate.pushFrame(computeRmsEnergy(loudFrame()), FRAME_MS);
    for (let i = 0; i < 15; i++) gate.pushFrame(computeRmsEnergy(silentFrame()), FRAME_MS);
    expect(gate.currentState).toBe('silence');
    expect(gate.pushFrame(computeRmsEnergy(loudFrame()), FRAME_MS)).toBe('speech_start');
  });

  it('accumulates sustained silence correctly across frames of varying duration, not just a fixed frame size', () => {
    const gate = new VadGate({ speechThresholdRms: 5000, silenceHangoverMs: 300 });
    gate.pushFrame(computeRmsEnergy(loudFrame()), FRAME_MS);
    // 100ms + 150ms = 250ms, still under the 300ms hangover.
    expect(gate.pushFrame(computeRmsEnergy(silentFrame()), 100)).toBeNull();
    expect(gate.pushFrame(computeRmsEnergy(silentFrame()), 150)).toBeNull();
    expect(gate.currentState).toBe('speech');
    // +60ms = 310ms, crosses the hangover.
    expect(gate.pushFrame(computeRmsEnergy(silentFrame()), 60)).toBe('speech_end');
  });
});
