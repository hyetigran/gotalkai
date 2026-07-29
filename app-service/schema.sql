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

-- === sessions =================================================================
-- "Stores the calibration actually used, so difficulty settings can be
-- correlated against completion and abandonment" (PRD §8).
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  -- No FK yet: the scenarios table is ticket #21's job ("Scenario
  -- selection"), not this schema ticket's — adding a constraint now would
  -- mean guessing its shape. Plain UUID until #21 lands.
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
