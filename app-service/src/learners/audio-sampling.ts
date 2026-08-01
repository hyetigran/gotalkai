/**
 * Ticket #31 AC #2: "Only 2–5% of sessions sampled for replay debugging
 * ... gated behind explicit consent that is separate from the general
 * ToS acceptance." Consent is checked *inside* this function, not left
 * to every caller to remember — a caller that forgets a separate
 * consent check would silently sample non-consenting learners, exactly
 * what AC #2 rules out.
 *
 * `random` is injectable (defaults to `Math.random`) so the sampling
 * rate itself can be tested statistically (many trials, real
 * `Math.random`) without the test controlling individual outcomes.
 *
 * No audio-storage subsystem exists yet to call this from
 * (ARCHITECTURE.md hasn't designed one) — this is the pure sampling
 * policy, built ahead of that capture path per this ticket's scope.
 */
export function shouldSampleSession(
  hasAudioSamplingConsent: boolean,
  sampleRate: number,
  random: () => number = Math.random,
): boolean {
  if (!hasAudioSamplingConsent)
    return false;
  return random() < sampleRate;
}
