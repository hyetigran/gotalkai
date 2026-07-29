-- Postgres schema for the data layer (ticket #19). See PRD.md §8 and
-- ARCHITECTURE.md §3.4 for the design rationale behind each table; the
-- comments below cite the specific line of reasoning per table/column
-- rather than repeating the full section here.
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so it can be re-applied
-- safely — see src/migrate.ts. No down-migrations: this is the first
-- schema ticket, there is nothing to roll back to yet.

-- === learners ================================================================
-- Deliberately minimal: only the two fields this ticket's ACs call out.
-- Full auth/profile columns are out of scope here — that's a later ticket,
-- not this schema skeleton.
CREATE TABLE IF NOT EXISTS learners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- From onboarding. Separate fields (PRD §8) "so transliteration can be
  -- retired deliberately rather than left on indefinitely."
  cyrillic_literate BOOLEAN NOT NULL DEFAULT false,
  translit_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket #31 AC #2: audio-sampling consent, "separate from the general
-- ToS acceptance" — a timestamp (not just a boolean) so there's a real
-- record of *when* consent was given, not just that it currently is.
-- NULL means never consented. Added on an existing table, not baked
-- into the CREATE TABLE above, since `learners` already existed before
-- this ticket (ticket #19).
--
-- Guarded by an information_schema check, not a bare `ADD COLUMN IF NOT
-- EXISTS` — that still takes an ACCESS EXCLUSIVE lock on `learners` on
-- every single applySchema call even when the column already exists
-- (confirmed: reproduced real `deadlock detected` errors under parallel
-- test execution, same root cause as the sessions_scenario_id_fkey
-- deadlock ticket #24 fixed — this table is referenced by
-- persona_memories/sessions/observations/learner_structures, all of
-- which take a row lock on `learners` for FK validation on every
-- insert). Skipping the ALTER entirely once the column already exists —
-- the case for every applySchema call after the very first one ever run
-- against a given database — removes the lock acquisition, not just the
-- write, exactly like that earlier fix.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'learners' AND column_name = 'audio_sampling_consent_at'
  ) THEN
    ALTER TABLE learners ADD COLUMN audio_sampling_consent_at TIMESTAMPTZ;
  END IF;
END $$;

-- === sessions =================================================================
-- "Stores the calibration actually used, so difficulty settings can be
-- correlated against completion and abandonment" (PRD §8).
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  -- The FK to scenarios(id) is added below, after that table exists —
  -- can't forward-reference a table defined later in this same file.
  scenario_id UUID,
  -- Repetition-exposure signal (PRD §8: "sessions-since-last-use, to
  -- measure repetition exposure against abandonment"). Computed by the
  -- app at session-assembly time from scenario_id's session history.
  scenario_sessions_since_last_use INTEGER,
  calibration JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_learner_id ON sessions (learner_id);
CREATE INDEX IF NOT EXISTS idx_sessions_scenario_id ON sessions (scenario_id);
-- Retention policy (PRD §7.7) filters on this column — see
-- src/retention.ts. Index makes the periodic sweep cheap as volume grows.
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at);
-- A composite (learner_id, started_at) index was tried here to serve
-- src/session-cap.ts's countSessionsToday query more directly, but a
-- plain (non-CONCURRENTLY) CREATE INDEX takes a SHARE lock on `sessions`
-- — and since applySchema runs the whole file in one transaction (a
-- prior deadlock fix, see src/schema.ts), that lock genuinely deadlocked
-- against concurrent test files writing to `sessions` at the same time
-- (reproduced: schema.test.ts's idempotency test failed with a real
-- `deadlock detected` under parallel Jest workers). The single-column
-- indexes above already make the query correct via a bitmap AND; that's
-- enough at this application's actual scale, so the composite index was
-- reverted rather than fixed with CREATE INDEX CONCURRENTLY (which can't
-- run inside applySchema's transaction at all).

-- === turns =====================================================================
CREATE TABLE IF NOT EXISTS turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL CHECK (speaker IN ('persona', 'learner')),
  content TEXT NOT NULL,
  -- Register split (PRD §8): "they differ for this persona and a single
  -- field cannot express it." Nullable — only the field matching a given
  -- turn's speaker is expected to be populated.
  persona_register TEXT,
  learner_register TEXT,
  -- Drives the reveal-rate signal (PRD §11) and the "understood her
  -- without help" debrief figure (PRD §8).
  revealed BOOLEAN NOT NULL DEFAULT false,
  -- Six-stage pipeline timing instrumentation (ARCHITECTURE.md §3.3).
  -- Highest-volume column by an order of magnitude (PRD §7.7) — the
  -- reason a retention policy exists before this data accumulates.
  timings JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turns_session_id ON turns (session_id);

-- === learner_structures ========================================================
-- The engine table (PRD §8): "Scenario selection reads it; the debrief
-- writes it. Everything else is plumbing around this table."
CREATE TABLE IF NOT EXISTS learner_structures (
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  -- e.g. 'genitive_plural', 'aspect_perfective' — the grammatical
  -- structure being tracked. Free-form key, not an enum: the structure
  -- catalog is content, not schema, and will grow without a migration.
  structure_key TEXT NOT NULL,
  exposures INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  avoidances INTEGER NOT NULL DEFAULT 0,
  stability NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, structure_key)
);

-- === persona_memories ==========================================================
-- The most sensitive table in the system (PRD §8/§12.2): "never logged,
-- never a trace attribute." That constraint is enforced structurally in
-- src/persona-memories.ts, not just documented here — every read of
-- `content` goes through a wrapper whose toString/toJSON/inspect are all
-- redacted, so an accidental `console.log(row)` or trace-attribute spread
-- can't leak it. This comment records the intent; it isn't the mechanism.
CREATE TABLE IF NOT EXISTS persona_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_referenced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_persona_memories_learner_id ON persona_memories (learner_id);

-- === observations / debrief_items ==============================================
-- Kept separate (PRD §8): "we keep everything the analyser noticed even
-- though only three are shown. That is the training data for tuning the
-- ranking function." debrief_items references the subset of observations
-- the ranking function (ticket #20) selected for display.
CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  -- e.g. 'grammar_error', 'avoidance', 'stress_error' — analyser-assigned
  -- category. Free-form for the same reason as structure_key above.
  kind TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observations_session_id ON observations (session_id);
CREATE INDEX IF NOT EXISTS idx_observations_learner_id ON observations (learner_id);

CREATE TABLE IF NOT EXISTS debrief_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  observation_id UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, observation_id)
);

CREATE INDEX IF NOT EXISTS idx_debrief_items_session_id ON debrief_items (session_id);

-- === persona_world_state =======================================================
-- Created now, deliberately unpopulated (PRD §8): "Cheap renewable
-- conversation material... Add the table now even if unpopulated;
-- migrating later is worse." No seed rows in this ticket.
CREATE TABLE IF NOT EXISTS persona_world_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- e.g. 'cat_health', 'neighbour_dispute'.
  topic TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- === scenarios / scenario_complications ========================================
-- Deferred here from ticket #19 ("no FK yet; scenarios table lands in
-- ticket #21"). Authored content (PRD §5.3: "Authored once, yields a
-- curriculum") — hand-seeded fixtures for now (src/seed-scenarios.ts),
-- not LLM-generated; there's no persona LLM pipeline yet (tickets
-- #13/#14).
CREATE TABLE IF NOT EXISTS scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable content identifier for seeding/lookups, independent of the
  -- DB-generated id — e.g. 'cat_vet_visit'.
  scene_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per complication level for a scenario — "the same underlying
-- scene scales in complication, not vocabulary, across levels" (PRD
-- §5.3's tea example; ticket #21 AC #2). `level` is 0-indexed to match
-- the Tomorrow screen's existing `currentStepIndex` fixture shape.
CREATE TABLE IF NOT EXISTS scenario_complications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level >= 0),
  label TEXT NOT NULL,
  intro TEXT NOT NULL,
  UNIQUE (scenario_id, level)
);

-- sessions.scenario_id had no FK when that table was created (ticket
-- #19) because this table didn't exist yet — add it now that it does.
--
-- Deliberately no ON DELETE clause, unlike every other FK in this file:
-- session history (and everything that cascades from it — turns,
-- observations, debrief_items) must survive even if a scenario row is
-- ever removed, so the default NO ACTION (blocking the delete instead of
-- cascading data loss) is the right behavior here, not an oversight.
--
-- Guarded by an explicit pg_constraint check, not an unconditional
-- DROP+ADD (Postgres has no ADD CONSTRAINT IF NOT EXISTS): every test
-- file calls applySchema in its own beforeAll, so this runs on every
-- single test run. ADD CONSTRAINT needs ACCESS EXCLUSIVE on `sessions`
-- and SHARE ROW EXCLUSIVE on `scenarios` (the referenced table) even
-- when the constraint already exists and nothing is actually changing —
-- taking those locks unconditionally, every time, genuinely deadlocked
-- against concurrent createSession calls (which INSERT into `sessions`
-- while referencing a `scenarios` row for FK validation) once ticket
-- #24 added enough concurrent session-creation load to make the timing
-- collision likely instead of rare (reproduced: real `deadlock
-- detected` errors under parallel test execution). Skipping the ALTER
-- entirely once the constraint already exists — the case for every
-- applySchema call after the very first one ever run against a given
-- database — removes the lock acquisition, not just the write.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_scenario_id_fkey') THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES scenarios(id);
  END IF;
END $$;
