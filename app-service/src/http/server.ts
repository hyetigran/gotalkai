import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { Env } from '../config/env';
import Anthropic from '@anthropic-ai/sdk';
import { createServer as createHttpServer } from 'node:http';
import { z } from 'zod';

import { getAddressBookForLearner } from '../address-book/address-book';
import { analyseSessionTranscript } from '../debrief/analyser';
import { getBenchmarkTrend, getCurrentBenchmarkSet, InvalidBenchmarkAttemptError, submitBenchmarkAttempt, submitBenchmarkAttemptRequestSchema } from '../benchmark/benchmark';
import { getDebriefForSession, writeAndRankObservations } from '../debrief/debrief';
import { parseUuidParam } from './id-params';
import { recordMemoryRequestSchema } from '../memories/memories-request';
import { recordObservationsRequestSchema } from '../debrief/observations-request';
import { recordPersonaMemory, selectAndMarkCallbackMemory } from '../memories/persona-memories';
import { PERSONA_IDS } from '../memories/personas';
import { deleteLearner, recordAudioSamplingConsent } from '../learners/privacy';
import { getScenarioViewForSession } from '../scenarios/scenario-view';
import { getSessionHistoryForLearner, sessionHistoryQuerySchema } from '../learners/session-history';
import { DailySessionCapReachedError } from '../learners/session-cap';
import { endSession, getLearnerIdForSession, getSessionSummary } from '../learners/session-summary';
import { createLearner, createLearnerRequestSchema, createSession, createSessionRequestSchema, getLearner, updateCalibrationVariant, updateCalibrationVariantRequestSchema } from '../learners/sessions';
import { issueSessionToken } from '../learners/session-token';
import { getTurnsForSession, markTurnRevealed, recordInterruption, recordInterruptionRequestSchema, recordTurn, recordTurnRequestSchema } from '../turns/turns';

export type AppServiceHandle = {
  /** The port actually bound — matters when `env.PORT` is `0` (tests ask the OS for a free port). */
  port: number;
  close: () => Promise<void>;
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      }
      catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const SESSION_OBSERVATIONS_PATH = /^\/sessions\/([^/]+)\/observations$/;
const SESSION_DEBRIEF_PATH = /^\/sessions\/([^/]+)\/debrief$/;
const SESSION_SCENARIO_PATH = /^\/sessions\/([^/]+)\/scenario$/;
const SESSION_TURNS_PATH = /^\/sessions\/([^/]+)\/turns$/;
const SESSION_SUMMARY_PATH = /^\/sessions\/([^/]+)\/summary$/;
const SESSION_END_PATH = /^\/sessions\/([^/]+)\/end$/;
const TURN_REVEAL_PATH = /^\/turns\/([^/]+)\/reveal$/;
const TURN_INTERRUPTION_PATH = /^\/turns\/([^/]+)\/interruption$/;
const LEARNER_MEMORIES_PATH = /^\/learners\/([^/]+)\/memories$/;
const LEARNER_CALLBACK_PATH = /^\/learners\/([^/]+)\/callback$/;
const LEARNER_ADDRESS_BOOK_PATH = /^\/learners\/([^/]+)\/address-book$/;
const LEARNER_SESSIONS_PATH = /^\/learners\/([^/]+)\/sessions$/;
const LEARNER_AUDIO_SAMPLING_CONSENT_PATH = /^\/learners\/([^/]+)\/audio-sampling-consent$/;
const LEARNER_CALIBRATION_VARIANT_PATH = /^\/learners\/([^/]+)\/calibration-variant$/;
const LEARNER_BENCHMARK_ATTEMPTS_PATH = /^\/learners\/([^/]+)\/benchmark-attempts$/;
const LEARNER_PATH = /^\/learners\/([^/]+)$/;

async function handleRequest(req: IncomingMessage, res: ServerResponse, pool: Pool, env: Env, anthropicClient: Anthropic): Promise<void> {
  // Ticket #34: split off the query string once, here — every route match below (`===`/regex `.exec`) targets the path alone, and `GET /learners/:id/callback?personaId=...` is the one place a query string exists at all.
  const [url = '', queryString] = (req.url ?? '').split('?');

  if (req.method === 'GET' && url === '/health') {
    try {
      const result = await pool.query<{ server_time: Date }>('SELECT now() AS server_time');
      sendJson(res, 200, { status: 'ok', serverTime: result.rows[0]?.server_time });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  if (req.method === 'POST' && url === '/learners') {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = createLearnerRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      const id = await createLearner(pool, parsed.data);
      sendJson(res, 201, { status: 'ok', id });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  if (req.method === 'POST' && url === '/sessions') {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = createSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      const id = await createSession(pool, parsed.data.learnerId, env.DAILY_SESSION_CAP);
      // docs/adr/0017's other disclosed gap, alongside mic capture: a
      // real per-session credential for voice-service, not a shared
      // static secret. Minted here, not read back later — this response
      // is the only place a caller can ever obtain it.
      const { token, expiresAt } = issueSessionToken(env.SESSION_TOKEN_SECRET, id);
      sendJson(res, 201, { status: 'ok', id, voiceServiceToken: token, voiceServiceTokenExpiresAt: expiresAt });
    }
    catch (error) {
      if (error instanceof DailySessionCapReachedError) {
        // 429, not a generic error — a distinct, expected outcome the
        // client keys off `code` (not the message string) to show
        // "come back tomorrow" framing, not an error state. PRD §9: the
        // cap is a unit-economics requirement enforced server-side, so
        // this has to be a real rejection a direct API call can't route
        // around — not just the client hiding the button.
        //
        // `message` deliberately echoes mobile/src/features/tomorrow/
        // tomorrow-fixture.ts's homeworkSub copy ("One session a day.
        // Distributed practice beats massed practice.") — the client
        // itself doesn't render this string (it keys off `code` and
        // redirects to the real Tomorrow screen), but keep the two in
        // sync if either copy changes; they're saying the same thing on
        // purpose, not by accident.
        sendJson(res, 429, {
          status: 'error',
          code: 'daily_cap_reached',
          message: 'One session a day. Distributed practice beats massed practice — come back tomorrow.',
        });
        return;
      }
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const observationsMatch = SESSION_OBSERVATIONS_PATH.exec(url);
  if (req.method === 'POST' && observationsMatch) {
    const sessionId = parseUuidParam(observationsMatch[1] as string);
    if (!sessionId) {
      sendJson(res, 400, { status: 'error', message: 'invalid session id' });
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = recordObservationsRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      const debriefItems = await writeAndRankObservations(pool, sessionId, parsed.data.learnerId, parsed.data.observations);
      sendJson(res, 201, { status: 'ok', debriefItems });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const debriefMatch = SESSION_DEBRIEF_PATH.exec(url);
  if (req.method === 'GET' && debriefMatch) {
    const sessionId = parseUuidParam(debriefMatch[1] as string);
    if (!sessionId) {
      sendJson(res, 400, { status: 'error', message: 'invalid session id' });
      return;
    }
    try {
      const debriefItems = await getDebriefForSession(pool, sessionId);
      sendJson(res, 200, { status: 'ok', debriefItems });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const summaryMatch = SESSION_SUMMARY_PATH.exec(url);
  if (req.method === 'GET' && summaryMatch) {
    const sessionId = parseUuidParam(summaryMatch[1] as string);
    if (!sessionId) {
      sendJson(res, 400, { status: 'error', message: 'invalid session id' });
      return;
    }
    try {
      const summary = await getSessionSummary(pool, sessionId);
      if (!summary) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      sendJson(res, 200, { status: 'ok', summary });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const scenarioMatch = SESSION_SCENARIO_PATH.exec(url);
  if (req.method === 'GET' && scenarioMatch) {
    const sessionId = parseUuidParam(scenarioMatch[1] as string);
    if (!sessionId) {
      sendJson(res, 400, { status: 'error', message: 'invalid session id' });
      return;
    }
    try {
      const scenario = await getScenarioViewForSession(pool, sessionId);
      if (!scenario) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      sendJson(res, 200, { status: 'ok', scenario });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const turnsMatch = SESSION_TURNS_PATH.exec(url);
  if (req.method === 'POST' && turnsMatch) {
    const sessionId = parseUuidParam(turnsMatch[1] as string);
    if (!sessionId) {
      sendJson(res, 400, { status: 'error', message: 'invalid session id' });
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = recordTurnRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      const id = await recordTurn(pool, sessionId, parsed.data);
      sendJson(res, 201, { status: 'ok', id });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const endMatch = SESSION_END_PATH.exec(url);
  if (req.method === 'POST' && endMatch) {
    const sessionId = parseUuidParam(endMatch[1] as string);
    if (!sessionId) {
      sendJson(res, 400, { status: 'error', message: 'invalid session id' });
      return;
    }
    try {
      const ended = await endSession(pool, sessionId);
      if (!ended) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      // The post-session analyser (debrief/analyser.ts), finally called
      // for real rather than requiring a test harness to fabricate
      // `observations`: reads this session's real turns, classifies them,
      // and runs the same write→avoidance→rank pipeline the observations
      // endpoint above does. Runs synchronously in this request — a real
      // LLM call, so this response is slower than a plain "mark ended"
      // would be, a deliberate simplicity tradeoff over a background job
      // queue for this scope; the mobile client already shows a loading
      // state on the Debrief screen it navigates to right after calling
      // this. Failure here (a bad/missing learnerId, a DB error) still
      // reports ended=true — the session genuinely did end, and losing
      // the analysis for one session is not a reason to tell the client
      // its "End" tap failed.
      const learnerId = await getLearnerIdForSession(pool, sessionId);
      if (learnerId) {
        const transcript = await getTurnsForSession(pool, sessionId);
        const observations = await analyseSessionTranscript(anthropicClient, transcript);
        if (observations.length > 0)
          await writeAndRankObservations(pool, sessionId, learnerId, observations);
      }
      sendJson(res, 200, { status: 'ok' });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const turnRevealMatch = TURN_REVEAL_PATH.exec(url);
  if (req.method === 'PATCH' && turnRevealMatch) {
    const turnId = parseUuidParam(turnRevealMatch[1] as string);
    if (!turnId) {
      sendJson(res, 400, { status: 'error', message: 'invalid turn id' });
      return;
    }
    try {
      const revealed = await markTurnRevealed(pool, turnId);
      if (!revealed) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      sendJson(res, 200, { status: 'ok' });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const turnInterruptionMatch = TURN_INTERRUPTION_PATH.exec(url);
  if (req.method === 'POST' && turnInterruptionMatch) {
    const turnId = parseUuidParam(turnInterruptionMatch[1] as string);
    if (!turnId) {
      sendJson(res, 400, { status: 'error', message: 'invalid turn id' });
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = recordInterruptionRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      const recorded = await recordInterruption(pool, turnId, parsed.data.interruptedAfterMs);
      if (!recorded) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      sendJson(res, 200, { status: 'ok' });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const memoriesMatch = LEARNER_MEMORIES_PATH.exec(url);
  if (req.method === 'POST' && memoriesMatch) {
    const learnerId = parseUuidParam(memoriesMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = recordMemoryRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      const id = await recordPersonaMemory(pool, learnerId, parsed.data.content, parsed.data.personaId);
      sendJson(res, 201, { status: 'ok', id });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const callbackMatch = LEARNER_CALLBACK_PATH.exec(url);
  if (req.method === 'GET' && callbackMatch) {
    const learnerId = parseUuidParam(callbackMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    // Ticket #34 / docs/adr/0023: which persona's memory to open with — omitted (every pre-#34 caller) defaults to Валентина inside selectAndMarkCallbackMemory itself, not here, so this stays `undefined` rather than duplicating that default. Zod-validated like every other untrusted-boundary input in this file (PRD §7.8) — `URLSearchParams.get` returns `null` for "absent," which Zod's own `.optional()` doesn't accept, so `?? undefined` bridges the two before parsing.
    const personaIdQueryParam = new URLSearchParams(queryString ?? '').get('personaId') ?? undefined;
    const personaIdParsed = z.enum(PERSONA_IDS).optional().safeParse(personaIdQueryParam);
    if (!personaIdParsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid personaId' });
      return;
    }
    try {
      const callbackLine = await selectAndMarkCallbackMemory(pool, learnerId, personaIdParsed.data);
      sendJson(res, 200, { status: 'ok', callbackLine });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const addressBookMatch = LEARNER_ADDRESS_BOOK_PATH.exec(url);
  if (req.method === 'GET' && addressBookMatch) {
    const learnerId = parseUuidParam(addressBookMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    try {
      const entries = await getAddressBookForLearner(pool, learnerId);
      sendJson(res, 200, { status: 'ok', entries });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const sessionsMatch = LEARNER_SESSIONS_PATH.exec(url);
  if (req.method === 'GET' && sessionsMatch) {
    const learnerId = parseUuidParam(sessionsMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    const sessionsQueryParsed = sessionHistoryQuerySchema.safeParse({
      limit: new URLSearchParams(queryString ?? '').get('limit') ?? undefined,
      cursorStartedAt: new URLSearchParams(queryString ?? '').get('cursorStartedAt') ?? undefined,
      cursorId: new URLSearchParams(queryString ?? '').get('cursorId') ?? undefined,
    });
    if (!sessionsQueryParsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid pagination params' });
      return;
    }
    try {
      const { limit, cursorStartedAt, cursorId } = sessionsQueryParsed.data;
      const page = await getSessionHistoryForLearner(pool, learnerId, {
        limit,
        cursor: cursorStartedAt && cursorId ? { startedAt: cursorStartedAt, id: cursorId } : undefined,
      });
      sendJson(res, 200, { status: 'ok', sessions: page.sessions, nextCursor: page.nextCursor });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const audioSamplingConsentMatch = LEARNER_AUDIO_SAMPLING_CONSENT_PATH.exec(url);
  if (req.method === 'POST' && audioSamplingConsentMatch) {
    const learnerId = parseUuidParam(audioSamplingConsentMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    try {
      const recorded = await recordAudioSamplingConsent(pool, learnerId);
      if (!recorded) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      sendJson(res, 200, { status: 'ok' });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const calibrationVariantMatch = LEARNER_CALIBRATION_VARIANT_PATH.exec(url);
  if (req.method === 'PATCH' && calibrationVariantMatch) {
    const learnerId = parseUuidParam(calibrationVariantMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = updateCalibrationVariantRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      const updated = await updateCalibrationVariant(pool, learnerId, parsed.data.calibrationVariant);
      if (!updated) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      sendJson(res, 200, { status: 'ok' });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  if (req.method === 'GET' && url === '/benchmark-sets/current') {
    try {
      const benchmarkSet = await getCurrentBenchmarkSet(pool);
      if (!benchmarkSet) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      sendJson(res, 200, { status: 'ok', benchmarkSet });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const benchmarkAttemptsMatch = LEARNER_BENCHMARK_ATTEMPTS_PATH.exec(url);
  if (req.method === 'POST' && benchmarkAttemptsMatch) {
    const learnerId = parseUuidParam(benchmarkAttemptsMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req);
    }
    catch {
      sendJson(res, 400, { status: 'error', message: 'invalid JSON body' });
      return;
    }
    const parsed = submitBenchmarkAttemptRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { status: 'error', message: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    try {
      const result = await submitBenchmarkAttempt(pool, learnerId, parsed.data);
      sendJson(res, 201, { status: 'ok', result });
    }
    catch (error) {
      if (error instanceof InvalidBenchmarkAttemptError) {
        sendJson(res, 400, { status: 'error', message: error.message });
        return;
      }
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  if (req.method === 'GET' && benchmarkAttemptsMatch) {
    const learnerId = parseUuidParam(benchmarkAttemptsMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    try {
      const trend = await getBenchmarkTrend(pool, learnerId);
      sendJson(res, 200, { status: 'ok', trend });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  const learnerMatch = LEARNER_PATH.exec(url);
  if (req.method === 'GET' && learnerMatch) {
    const learnerId = parseUuidParam(learnerMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    try {
      const learner = await getLearner(pool, learnerId);
      if (!learner) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      sendJson(res, 200, { status: 'ok', learner });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  if (req.method === 'DELETE' && learnerMatch) {
    const learnerId = parseUuidParam(learnerMatch[1] as string);
    if (!learnerId) {
      sendJson(res, 400, { status: 'error', message: 'invalid learner id' });
      return;
    }
    try {
      const deleted = await deleteLearner(pool, learnerId);
      if (!deleted) {
        sendJson(res, 404, { status: 'not found' });
        return;
      }
      sendJson(res, 200, { status: 'ok' });
    }
    catch {
      sendJson(res, 503, { status: 'error', message: 'database unavailable' });
    }
    return;
  }

  sendJson(res, 404, { status: 'not found' });
}

/**
 * Starts the app service. Endpoints:
 * - `GET /health` — round-trips a real query through the Postgres pool
 *   (`SELECT now()`) rather than returning a stubbed response.
 * - `POST /learners` — the real onboarding endpoint (ticket #30 AC
 *   #1/#2): writes `cyrillic_literate`/`translit_enabled` from the
 *   request body (both optional — omitted fields fall back to
 *   schema.sql's own column defaults, so existing debug-screen callers
 *   with an empty body are unaffected). Also seeds 1–2 starter
 *   `persona_memories` so session one is never cold (ticket #22/#30 AC
 *   #5).
 * - `GET /learners/:id` — a learner's onboarding answers, for the
 *   Converse screen to decide what occupies the shared reveal slot
 *   (ticket #30 AC #3).
 * - `POST /sessions` — creates a session AND runs scenario selection
 *   (ticket #21) against the learner's real learner_structures/session
 *   history, writing the result onto the new row. Also mints and returns
 *   a short-lived, session-scoped `voiceServiceToken` (session-token.ts)
 *   — the real per-session credential docs/adr/0017 disclosed as
 *   missing, replacing voice-service's previous static shared secret.
 * - `POST /sessions/:id/observations` — writes every observation the
 *   caller reports, diffs the session's real observations against its
 *   injected target structure and writes a distinct `avoidance`
 *   observation if it was never attempted (PRD §5.5, ticket #23), then
 *   ranks and promotes the top patterns into `debrief_items` (PRD §5.4,
 *   ticket #20).
 * - `GET /sessions/:id/debrief` — the promoted `debrief_items` for a
 *   session, for the Debrief screen to render.
 * - `GET /sessions/:id/scenario` — the session's assigned scenario
 *   resolved into full content (title/ladder/intro), for the Tomorrow
 *   screen to render (ticket #21).
 * - `POST /sessions/:id/turns` — writes one `turns` row (ticket #29 /
 *   docs/adr/0022): the persistence link voice-service's turn
 *   orchestrator posts to after each learner/persona turn, the
 *   foundation every derived observability metric reads from.
 * - `GET /sessions/:id/summary` — real turn counts, reveal/comprehension
 *   figures, and session duration (session-summary.ts) for the Debrief
 *   screen's top section — the counterpart to `/debrief`'s pattern
 *   cards, for the summary copy above them.
 * - `POST /sessions/:id/end` — marks the session ended (`ended_at`),
 *   then runs the post-session analyser (debrief/analyser.ts) against
 *   its real turns and feeds the result through the same
 *   write→avoidance→rank pipeline `/observations` above uses — the
 *   "post-session analyser, ticket #14+" every earlier comment in this
 *   codebase disclosed as not-yet-built, finally called for real instead
 *   of requiring a test harness to fabricate `observations`.
 * - `PATCH /turns/:id/reveal` — marks a turn's translation as revealed
 *   (ticket #29 AC #3: reveal-rate signal, needs no manual labelling).
 * - `POST /turns/:id/interruption` — records a barge-in's elapsed ms
 *   since the interrupted persona turn's own `t5FirstAudio` (ticket #29:
 *   false-interruption-rate signal).
 * - `POST /learners/:id/memories` — writes a `persona_memories` row
 *   (ticket #22 AC #1).
 * - `GET /learners/:id/callback` — the real callback line for the Open
 *   screen: the learner's least-recently-referenced memory, marked
 *   referenced so it doesn't repeat every day (ticket #22 AC #2). Takes
 *   an optional `?personaId=` query param (ticket #34 / docs/adr/0023),
 *   scoping the callback to one persona's own memories — defaults to
 *   Валентина when omitted, matching every pre-#34 caller's behavior.
 * - `GET /learners/:id/address-book` — real sealed/next/reached status
 *   per persona (ticket #34 AC #3), computed from real
 *   `learner_structures` B1-readiness data — see address-book.ts /
 *   docs/adr/0023 for what "B1-ready" is proxied from.
 * - `GET /learners/:id/sessions` — the History tab's real session list
 *   (tab restructuring, mobile `debrief-history-screen.tsx`),
 *   keyset-paginated newest-first: `?limit=` (default
 *   `SESSION_HISTORY_PAGE_SIZE`, capped at `SESSION_HISTORY_MAX_LIMIT`)
 *   and `?cursorStartedAt=&cursorId=` (both-or-neither — the previous
 *   page's own `nextCursor`, echoed back verbatim). Each session carries
 *   a real turn count and its #1-ranked debrief pattern (null when the
 *   session has none yet) — see session-history.ts.
 * - `POST /learners/:id/audio-sampling-consent` — records
 *   `audio_sampling_consent_at`, separate from any ToS-acceptance flow
 *   (ticket #31 AC #2).
 * - `PATCH /learners/:id/calibration-variant` — flips an existing
 *   learner's `partner_learner`/`heritage_speaker` calibration (ticket
 *   #36 UAT #1), affecting future sessions' dial defaults only.
 * - `DELETE /learners/:id` — the single deletion path (ticket #31 AC
 *   #4): removes the learner row, and via schema.sql's existing FK
 *   cascade graph, every row that hangs off it — memories, sessions,
 *   turns, observations, debrief_items, learner_structures — in one
 *   statement.
 *
 * Everything else (auth, persona LLM output) is later ticket work
 * (ARCHITECTURE.md §3.2).
 */
export type AppServiceDependencies = {
  /**
   * Injectable for tests (server.test.ts passes a fake so the
   * `POST /sessions/:id/end` route's analyser call doesn't hit the real
   * Anthropic API) — defaults to a real client built from
   * `env.ANTHROPIC_API_KEY` right below when omitted, so main.ts (a
   * real deployment) needs no changes to get a real client.
   */
  anthropicClient?: Anthropic;
};

export function startServer(env: Env, pool: Pool, dependencies: AppServiceDependencies = {}): Promise<AppServiceHandle> {
  const anthropicClient = dependencies.anthropicClient ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return new Promise((resolve, reject) => {
    const httpServer = createHttpServer((req, res) => {
      handleRequest(req, res, pool, env, anthropicClient).catch(() => {
        sendJson(res, 500, { status: 'error', message: 'internal error' });
      });
    });

    httpServer.once('error', reject);
    httpServer.listen(env.PORT, () => {
      const address = httpServer.address();
      const port = typeof address === 'object' && address !== null ? address.port : env.PORT;
      resolve({
        port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            httpServer.close((err) => {
              if (err)
                closeReject(err);
              else
                closeResolve();
            });
          }),
      });
    });
  });
}
