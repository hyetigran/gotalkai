import type { SessionSummary } from './api';

function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt)
    return null;
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0)
    return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${seconds} s`;
}

/**
 * Mirrors debrief-fixture.ts's own `sessionMeta` copy shape ("8 min 12 s
 * · 14 turns · she spoke 61%") from a real `SessionSummary`. `endedAt`
 * should always be present by the time a real session reaches this
 * screen — `converse-screen.tsx`'s `goToDebrief` awaits `POST
 * /sessions/:id/end` before navigating here — so the duration segment
 * is simply omitted (not "0 min 0 s") on the rare path where it isn't,
 * e.g. that call failed and the session is still real, just unended.
 */
export function formatSessionMeta(summary: SessionSummary): string {
  const duration = formatDuration(summary.startedAt, summary.endedAt);
  const spokenPercent = summary.totalTurns > 0 ? Math.round((summary.personaTurns / summary.totalTurns) * 100) : 0;
  const parts = [duration, `${summary.totalTurns} turns`, `she spoke ${spokenPercent}%`]
    .filter((part): part is string => part !== null);
  return parts.join(' · ');
}
