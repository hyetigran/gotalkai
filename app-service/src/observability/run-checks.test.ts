import { Pool } from 'pg';

import { applySchema } from '../schema';
import { recordTurn } from '../turns';
import { runObservabilityChecks } from './run-checks';

/**
 * Runs against a REAL local Postgres instance, matching turns.test.ts's
 * own precedent. No webhook URLs configured in these tests — both
 * alerting functions no-op their network call in that case (alerting.ts),
 * so this exercises the real query/decision logic without needing a
 * fake HTTP server; console spies confirm each check actually ran.
 */
describe('runObservabilityChecks', () => {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/lingoai_app_service';
  let pool: Pool;
  let createdLearnerIds: string[];

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await applySchema(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => {
    createdLearnerIds = [];
  });

  afterEach(async () => {
    if (createdLearnerIds.length > 0)
      await pool.query('DELETE FROM learners WHERE id = ANY($1)', [createdLearnerIds]);
  });

  async function makeSession(): Promise<{ learnerId: string; sessionId: string }> {
    const learnerResult = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
    const learnerRow = learnerResult.rows[0];
    if (!learnerRow)
      throw new Error('insert did not return a row');
    createdLearnerIds.push(learnerRow.id);
    const sessionResult = await pool.query<{ id: string }>('INSERT INTO sessions (learner_id) VALUES ($1) RETURNING id', [learnerRow.id]);
    const sessionRow = sessionResult.rows[0];
    if (!sessionRow)
      throw new Error('insert did not return a row');
    return { learnerId: learnerRow.id, sessionId: sessionRow.id };
  }

  it('pages a P95 breach and a cost-threshold crossing via sendHealthAlert, and always sends a quality digest — never the reverse', async () => {
    const { sessionId } = await makeSession();
    await recordTurn(pool, sessionId, {
      speaker: 'persona',
      content: 'а',
      costUsd: 999, // guaranteed over the $12 default subscription price
      timings: { t0TurnDetected: 0, t1SttFinal: 100, t2PersonaStart: 100, t3PersonaComplete: 400, t4StressAnnotated: 420, t5FirstAudio: 5000 }, // guaranteed over any sane P95 budget
    });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runObservabilityChecks(pool, { P95_LATENCY_BUDGET_MS: 900, SUBSCRIPTION_PRICE_USD: 12 });

    const healthAlertCalls = errorSpy.mock.calls.filter(call => call[0] === '[health-alert]');
    expect(healthAlertCalls.some(call => (call[1] as { source: string }).source === 'p95_budget_breach')).toBe(true);
    expect(healthAlertCalls.some(call => (call[1] as { source: string }).source === 'cost_threshold_crossed')).toBe(true);

    const qualityReportCalls = logSpy.mock.calls.filter(call => call[0] === '[quality-report]');
    expect(qualityReportCalls).toHaveLength(1);

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('sends only the quality digest, no health page, when nothing breaches budget or cost', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Astronomically high budget/price — nothing in the shared test database can cross either.
    await runObservabilityChecks(pool, { P95_LATENCY_BUDGET_MS: 1_000_000, SUBSCRIPTION_PRICE_USD: 1_000_000 });

    const healthAlertCalls = errorSpy.mock.calls.filter(call => call[0] === '[health-alert]');
    expect(healthAlertCalls).toHaveLength(0);
    const qualityReportCalls = logSpy.mock.calls.filter(call => call[0] === '[quality-report]');
    expect(qualityReportCalls).toHaveLength(1);

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
