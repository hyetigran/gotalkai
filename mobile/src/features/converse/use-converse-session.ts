import * as React from 'react';

import { CONVERSE_SCRIPT } from './scripted-demo-script';

/**
 * Turn cadence from the mockup README: "Learner turn → 1150ms listening →
 * 1100ms thinking (filler «ну…» visible) → her reply." Real target is
 * 700-900ms time-to-first-audio once the live pipeline lands; these are
 * scripted-demo stand-ins only.
 */
const LISTENING_MS = 1150;
const THINKING_MS = 1100;

/** README: "Auto-release ~45s, so a learner who puts the phone down cannot hang the session." */
const HOLD_AUTO_RELEASE_MS = 45_000;

export type ConversePhase = 'idle' | 'listening' | 'thinking';

/** The pausable listening→thinking countdown — deadline while running, remaining while paused by a hold. */
type PausableCountdown = {
  timer: ReturnType<typeof setTimeout> | null;
  deadline: number | null;
  remainingOnPause: number | null;
};

/**
 * State machine for the Converse screen's scripted demo. Mirrors the
 * mockup's turn-taking timers, but — unlike the mockup, where hold-to-think
 * is purely a visual decoration and the underlying timers keep running
 * regardless — actually suspends the in-flight turn timer while held, per
 * this ticket's acceptance criteria ("the script does not advance while
 * held").
 *
 * "Has the floor" (docs/adr/0002-hold-to-think-requires-the-floor.md): the
 * ADR resolves two no-op cases into one rule — holding does nothing during
 * her turn (`thinking`), and does nothing "immediately after her opening
 * line before the learner has spoken" (i.e. before `holdSeen`, since that
 * flips true in the same tick as the learner's first `speak()`). Both are
 * expressed as one `hasFloor` check, with no special-casing between them,
 * per the ADR's stated consequence.
 */
export function useConverseSession() {
  const [phase, setPhase] = React.useState<ConversePhase>('idle');
  const [turnsShown, setTurnsShown] = React.useState(1);
  const [holding, setHolding] = React.useState(false);
  const [holdSeen, setHoldSeen] = React.useState(false);
  const [revealed, setRevealed] = React.useState<Record<number, boolean>>({});

  const listeningCountdownRef = React.useRef<PausableCountdown>({
    timer: null,
    deadline: null,
    remainingOnPause: null,
  });
  const thinkingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReleaseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasFloor = phase !== 'thinking' && holdSeen;

  const advanceToThinking = React.useCallback(() => {
    listeningCountdownRef.current.timer = null;
    listeningCountdownRef.current.deadline = null;
    setTurnsShown(prev => Math.min(prev + 1, CONVERSE_SCRIPT.length));
    setPhase('thinking');
    thinkingTimerRef.current = setTimeout(() => {
      thinkingTimerRef.current = null;
      setTurnsShown(prev => Math.min(prev + 1, CONVERSE_SCRIPT.length));
      setPhase('idle');
    }, THINKING_MS);
  }, []);

  const speak = React.useCallback(() => {
    if (phase !== 'idle' || holding)
      return;
    if (turnsShown >= CONVERSE_SCRIPT.length)
      return;
    if (!holdSeen)
      setHoldSeen(true);
    setPhase('listening');
    listeningCountdownRef.current.deadline = Date.now() + LISTENING_MS;
    listeningCountdownRef.current.timer = setTimeout(advanceToThinking, LISTENING_MS);
  }, [phase, holding, turnsShown, holdSeen, advanceToThinking]);

  const holdOff = React.useCallback(() => {
    setHolding((currentlyHolding) => {
      if (!currentlyHolding)
        return currentlyHolding;
      if (autoReleaseTimerRef.current) {
        clearTimeout(autoReleaseTimerRef.current);
        autoReleaseTimerRef.current = null;
      }
      const countdown = listeningCountdownRef.current;
      if (countdown.remainingOnPause != null) {
        const remaining = countdown.remainingOnPause;
        countdown.remainingOnPause = null;
        countdown.deadline = Date.now() + remaining;
        countdown.timer = setTimeout(advanceToThinking, remaining);
      }
      return false;
    });
  }, [advanceToThinking]);

  const holdOn = React.useCallback(() => {
    if (!hasFloor || holding)
      return;
    const countdown = listeningCountdownRef.current;
    if (countdown.timer) {
      clearTimeout(countdown.timer);
      countdown.timer = null;
      countdown.remainingOnPause = Math.max(0, (countdown.deadline ?? Date.now()) - Date.now());
      countdown.deadline = null;
    }
    setHolding(true);
    autoReleaseTimerRef.current = setTimeout(holdOff, HOLD_AUTO_RELEASE_MS);
  }, [hasFloor, holding, holdOff]);

  const toggleReveal = React.useCallback((turnIndex: number) => {
    setRevealed(prev => ({ ...prev, [turnIndex]: !prev[turnIndex] }));
  }, []);

  React.useEffect(() => {
    // Same mutable object for the component's whole lifetime — reading it in cleanup still sees the latest timer.
    const countdown = listeningCountdownRef.current;
    return () => {
      if (countdown.timer)
        clearTimeout(countdown.timer);
      if (thinkingTimerRef.current)
        clearTimeout(thinkingTimerRef.current);
      if (autoReleaseTimerRef.current)
        clearTimeout(autoReleaseTimerRef.current);
    };
  }, []);

  const turns = CONVERSE_SCRIPT.slice(0, turnsShown);
  const scriptExhausted = turnsShown >= CONVERSE_SCRIPT.length;
  const chipsVisible = phase === 'idle' && !holding && !scriptExhausted;

  return {
    phase,
    turns,
    holding,
    holdSeen,
    revealed,
    hasFloor,
    chipsVisible,
    scriptExhausted,
    speak,
    holdOn,
    holdOff,
    toggleReveal,
  };
}
