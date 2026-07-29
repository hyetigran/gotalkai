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
 * harness in the meantime) may or may not have included natural-language
 * `title`/`body`/`tag` fields. This fills in a reasonable fallback from
 * the structural fields (`structureKey`, `kind`, `impeded`) that always
 * exist, so the screen never renders blank copy.
 */
export function mapDebriefItemToPattern(item: DebriefItem): DebriefPattern {
  const detail = item.detail;
  const title = typeof detail.title === 'string' ? detail.title : (typeof detail.structureKey === 'string' ? detail.structureKey : item.kind);
  const body = typeof detail.body === 'string' ? detail.body : '';
  const tag = typeof detail.tag === 'string' ? detail.tag : (detail.impeded === true ? 'impeded communication' : null);
  return {
    index: String(item.rank + 1).padStart(2, '0'),
    title,
    body,
    tag,
  };
}
