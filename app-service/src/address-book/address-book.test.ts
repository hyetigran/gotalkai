import { Pool } from 'pg';

import { B1_READY_STRUCTURE_COUNT } from './address-book-math';
import { getAddressBookForLearner } from './address-book';
import { READINESS_MASTERY_STABILITY } from '../debrief/debrief-ranking';
import { PERSONA_DIALS } from '../memories/personas';
import { applySchema } from '../db/schema';

/** Runs against a REAL local Postgres instance, matching persona-memories.test.ts's own precedent. */
describe('getAddressBookForLearner', () => {
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

  async function makeLearner(): Promise<string> {
    const result = await pool.query<{ id: string }>('INSERT INTO learners DEFAULT VALUES RETURNING id');
    const row = result.rows[0];
    if (!row)
      throw new Error('insert did not return a row');
    createdLearnerIds.push(row.id);
    return row.id;
  }

  async function masterStructure(learnerId: string, structureKey: string): Promise<void> {
    await pool.query(
      `INSERT INTO learner_structures (learner_id, structure_key, stability)
       VALUES ($1, $2, $3)`,
      [learnerId, structureKey, READINESS_MASTERY_STABILITY],
    );
  }

  it('returns Валентина reached and Елена next for a fresh learner with no tracked structures', async () => {
    const learnerId = await makeLearner();

    const entries = await getAddressBookForLearner(pool, learnerId);

    expect(entries).toEqual(expect.arrayContaining([
      { personaId: 'valentina', status: 'reached', dials: PERSONA_DIALS.valentina },
      { personaId: 'elena', status: 'next', dials: PERSONA_DIALS.elena },
    ]));
  });

  it('unlocks Елена (reached) once real learner_structures data crosses the B1-ready structure count', async () => {
    const learnerId = await makeLearner();
    const structureKeys = ['aspect_perfective', 'verbs_of_motion', 'case_government', 'register', 'stress_placement'];
    for (let i = 0; i < B1_READY_STRUCTURE_COUNT; i++)
      await masterStructure(learnerId, structureKeys[i] as string);

    const entries = await getAddressBookForLearner(pool, learnerId);

    expect(entries).toEqual(expect.arrayContaining([
      { personaId: 'elena', status: 'reached', dials: PERSONA_DIALS.elena },
    ]));
  });

  it('does not count a structure below the mastery-stability threshold toward B1-readiness', async () => {
    const learnerId = await makeLearner();
    // One row deliberately below READINESS_MASTERY_STABILITY.
    await pool.query(
      `INSERT INTO learner_structures (learner_id, structure_key, stability) VALUES ($1, 'aspect_perfective', $2)`,
      [learnerId, READINESS_MASTERY_STABILITY - 0.1],
    );

    const entries = await getAddressBookForLearner(pool, learnerId);

    expect(entries).toEqual(expect.arrayContaining([
      { personaId: 'elena', status: 'next', dials: PERSONA_DIALS.elena },
    ]));
  });

  it('ticket #34 AC #2: Елена\'s dial calibration is her own, distinct from Валентина\'s — comprehension load and production demand both higher, per her established characterization', () => {
    expect(PERSONA_DIALS.elena).not.toEqual(PERSONA_DIALS.valentina);
    expect(PERSONA_DIALS.elena.comprehensionLoad).toBeGreaterThan(PERSONA_DIALS.valentina.comprehensionLoad);
    expect(PERSONA_DIALS.elena.productionDemand).toBeGreaterThan(PERSONA_DIALS.valentina.productionDemand);
  });
});
