import type { Pool } from 'pg';

/**
 * Hand-authored scenario content (PRD §5.3: "Authored once, yields a
 * curriculum"). Not LLM-generated — there's no persona LLM pipeline yet
 * (tickets #13/#14). Two scenarios so the selector has a real pool to
 * rotate between (ticket #21's least-recently-used logic is otherwise
 * untestable against real data with only one candidate).
 *
 * The cat/vet scene's copy matches the Tomorrow screen's pre-existing
 * fixture (tomorrow-fixture.ts) so the before/after is directly
 * comparable. The tea scene reuses PRD §5.3's own canonical example
 * verbatim.
 */
const SCENARIOS: { sceneKey: string; title: string; levels: { label: string; intro: string }[] }[] = [
  {
    sceneKey: 'cat_vet_visit',
    title: 'The cat is ill',
    levels: [
      { label: 'She offers you tea', intro: 'A quiet visit — she puts the kettle on and asks how your week has been.' },
      { label: 'The cat was driven to the vet last night', intro: 'She will want to know what the vet said — and she will ask you to tell it back to her.' },
      { label: 'She is hurt that you did not visit', intro: 'The cat is home now, but she noticed you stayed away while it was ill, and it stung.' },
    ],
  },
  {
    sceneKey: 'tea_visit',
    title: 'Tea at Валентина\'s',
    levels: [
      { label: 'She offers tea', intro: 'A simple visit — tea, biscuits, and whatever is on her mind today.' },
      { label: 'She is out of the tea you like', intro: 'Your usual tea is gone; she wants to talk you through the substitute without it becoming a whole ordeal.' },
      { label: 'She is offended you did not visit', intro: 'It has been a while since your last visit, and she lets you know it, gently but clearly.' },
    ],
  },
];

/** Idempotent: `ON CONFLICT ... DO UPDATE` on both tables (re-running refreshes edited copy rather than leaving it stale), safe to re-run. */
export async function seedScenarios(pool: Pool): Promise<void> {
  for (const scenario of SCENARIOS) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO scenarios (scene_key, title) VALUES ($1, $2)
       ON CONFLICT (scene_key) DO UPDATE SET scene_key = EXCLUDED.scene_key
       RETURNING id`,
      [scenario.sceneKey, scenario.title],
    );
    const scenarioId = result.rows[0]?.id;
    if (!scenarioId)
      throw new Error(`failed to seed scenario ${scenario.sceneKey}`);

    for (const [level, { label, intro }] of scenario.levels.entries()) {
      await pool.query(
        `INSERT INTO scenario_complications (scenario_id, level, label, intro)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (scenario_id, level) DO UPDATE SET label = EXCLUDED.label, intro = EXCLUDED.intro`,
        [scenarioId, level, label, intro],
      );
    }
  }
}
