import type { SessionHistoryEntry } from './api';

/**
 * Scripted History-tab content, matching the same "no learnerId → show
 * scripted content" convention as the Open and Debrief screens (see
 * those screens' own doc comments) rather than the tab's real, empty
 * "your past conversations will show up here" state — a demo/QA run
 * with no real learner otherwise shows a blank History tab while every
 * other tab in the daily loop has scripted content to show.
 *
 * `topPattern` shapes match `DebriefItem['detail']` as read by
 * `derivePatternTitle` (`map-debrief-item.ts`) — `title` present, so
 * these render verbatim rather than falling back to `structureKey`/`kind`.
 * Recycles two of `debrief-fixture.ts`'s own pattern titles so the
 * scripted History list and the scripted single-session Debrief screen
 * agree with each other.
 */
export const SESSION_HISTORY_FIXTURE: SessionHistoryEntry[] = [
  {
    id: 'fixture-session-1',
    startedAt: '2026-08-01T15:32:00.000Z',
    endedAt: '2026-08-01T15:40:12.000Z',
    turnCount: 14,
    topPattern: { kind: 'grammar', detail: { title: 'Мы иска́ли, not мы и́щем.' } },
  },
  {
    id: 'fixture-session-2',
    startedAt: '2026-07-29T15:10:00.000Z',
    endedAt: '2026-07-29T15:17:41.000Z',
    turnCount: 11,
    topPattern: { kind: 'grammar', detail: { title: 'в гараже́, not в гара́ж.' } },
  },
  {
    id: 'fixture-session-3',
    startedAt: '2026-07-26T15:05:00.000Z',
    endedAt: '2026-07-26T15:12:30.000Z',
    turnCount: 9,
    topPattern: null,
  },
] as const;
