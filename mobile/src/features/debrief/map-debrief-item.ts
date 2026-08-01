import type { DebriefItem } from './api';

export type DebriefPattern = {
  index: string;
  title: string;
  body: string;
  tag: string | null;
};

/**
 * `observations.detail` is free-form JSONB (ticket #19) — whatever wrote
 * the observation (the post-session analyser, ticket #14+, or a test
 * harness in the meantime) may or may not have included a natural-
 * language `title` field. Falls back to the structural fields
 * (`structureKey`, `kind`) that always exist, so callers never render
 * blank copy. Shared by `mapDebriefItemToPattern` below (the single-
 * session Debrief screen) and the History tab's session-list summary —
 * both need "one short line describing this pattern," just at different
 * granularities.
 */
export function derivePatternTitle(kind: string, detail: Record<string, unknown>): string {
  if (typeof detail.title === 'string')
    return detail.title;
  if (typeof detail.structureKey === 'string')
    return detail.structureKey;
  return kind;
}

/**
 * `observations.detail` is free-form JSONB (ticket #19) — whatever wrote
 * the observation (the post-session analyser, ticket #14+, or a test
 * harness in the meantime) may or may not have included natural-language
 * `title`/`body`/`tag` fields. This fills in a reasonable fallback from
 * the structural fields (`structureKey`, `kind`, `impeded`) that always
 * exist, so the screen never renders blank copy.
 */
export function mapDebriefItemToPattern(item: DebriefItem): DebriefPattern {
  const detail = item.detail;
  const title = derivePatternTitle(item.kind, detail);
  const body = typeof detail.body === 'string' ? detail.body : '';
  const tag = typeof detail.tag === 'string' ? detail.tag : (detail.impeded === true ? 'impeded communication' : null);
  return {
    index: String(item.rank + 1).padStart(2, '0'),
    title,
    body,
    tag,
  };
}
