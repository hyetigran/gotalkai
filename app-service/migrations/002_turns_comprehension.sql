-- Debrief wiring: the Debrief screen's "she understood you X of Y" figure
-- needs a real per-turn signal. voice-service's persona LLM already
-- produces this (persona.ts's PERSONA_COMPREHENSION_VALUES, sent to the
-- mobile client as persona_turn's own `comprehension` field) — it was
-- just never persisted past the live session. This column is that
-- persistence, mirroring the guarded-ALTER idiom 001_init.sql already
-- used for turns.cost_usd/interrupted_after_ms (same high-write-volume
-- table, same deadlock-avoidance reason), as a new file rather than
-- amending 001_init.sql in place — schema.ts's applySchema records each
-- migration file as applied exactly once, so a database that already ran
-- 001_init.sql would never see an edit made to it after the fact.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'turns' AND column_name = 'comprehension'
  ) THEN
    -- Mirrors voice-service/src/pipeline/persona.ts's
    -- PERSONA_COMPREHENSION_VALUES ('understood' | 'partial' |
    -- 'not_understood') — duplicated, not imported, same cross-service
    -- constraint turns.ts's own `timings` column already documents (no
    -- pnpm workspace linking app-service to voice-service). Only ever
    -- populated on 'persona' rows (the signal describes whether *she*
    -- understood the learner's preceding turn); NULL for 'learner' rows,
    -- same "nullable, only the matching speaker's field is populated"
    -- convention persona_register/learner_register already use.
    ALTER TABLE turns ADD COLUMN comprehension TEXT;
  END IF;
END $$;
