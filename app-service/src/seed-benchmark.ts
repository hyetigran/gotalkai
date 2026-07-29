import type { Pool } from 'pg';

/**
 * Ticket #35 / docs/adr/0018: placeholder benchmark sets so the pipeline
 * (schema → API → mobile flow) has something real to exercise end to
 * end. This is **not** real content — PRD §6.3 asks for "authentic
 * Russian audio" (real native-speaker recordings), which cannot be
 * responsibly sourced or fabricated in this environment (see the ADR).
 * `audioUrl` deliberately points at a placeholder path that does not
 * resolve to a real file; sourcing and hosting genuine curated audio,
 * and refreshing it monthly, is a human content-curation task, out of
 * scope here.
 *
 * Two months, not one: the ticket's own UAT step 2 ("take it again a
 * month later with refreshed content; confirm the second attempt didn't
 * reuse identical clips") needs a second, different month's set to be
 * manually exercisable at all — a single seeded month made that
 * unrunnable even as a placeholder walkthrough. `2026-06` plays the role
 * of "last month" relative to the `2026-07` set already seeded.
 */
const PLACEHOLDER_SETS: { monthKey: string; title: string; items: { audioUrl: string; question: string; choices: string[]; correctChoiceIndex: number }[] }[] = [
  {
    monthKey: '2026-06',
    title: 'Placeholder benchmark (2026-06) — pending real content curation',
    items: [
      {
        audioUrl: 'https://example.invalid/benchmark-placeholder/2026-06/item-1.mp3',
        question: '[PLACEHOLDER] Куда пошёл герой?',
        choices: ['В магазин', 'На вокзал', 'Домой', 'В кафе'],
        correctChoiceIndex: 0,
      },
    ],
  },
  {
    monthKey: '2026-07',
    title: 'Placeholder benchmark (2026-07) — pending real content curation',
    items: [
      {
        audioUrl: 'https://example.invalid/benchmark-placeholder/2026-07/item-1.mp3',
        question: '[PLACEHOLDER] Что купил герой?',
        choices: ['Хлеб', 'Молоко', 'Билет', 'Газету'],
        correctChoiceIndex: 1,
      },
    ],
  },
];

/** Idempotent: `ON CONFLICT ... DO UPDATE`, matching seed-scenarios.ts's own pattern — safe to re-run. */
export async function seedBenchmark(pool: Pool): Promise<void> {
  for (const set of PLACEHOLDER_SETS) {
    const setResult = await pool.query<{ id: string }>(
      `INSERT INTO benchmark_sets (month_key, title) VALUES ($1, $2)
       ON CONFLICT (month_key) DO UPDATE SET title = EXCLUDED.title
       RETURNING id`,
      [set.monthKey, set.title],
    );
    const setId = setResult.rows[0]?.id;
    if (!setId)
      throw new Error(`failed to seed benchmark set ${set.monthKey}`);

    for (const [order, item] of set.items.entries()) {
      await pool.query(
        `INSERT INTO benchmark_items (benchmark_set_id, item_order, audio_url, question, choices, correct_choice_index)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (benchmark_set_id, item_order) DO UPDATE SET
           audio_url = EXCLUDED.audio_url, question = EXCLUDED.question, choices = EXCLUDED.choices, correct_choice_index = EXCLUDED.correct_choice_index`,
        [setId, order, item.audioUrl, item.question, JSON.stringify(item.choices), item.correctChoiceIndex],
      );
    }
  }
}
