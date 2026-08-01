import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Real per-session credential issuance (docs/adr/0017's disclosed gap:
 * "Real per-session credential issuance from app-service ... That
 * issuance still doesn't exist"; ARCHITECTURE.md §6: "App service
 * authenticates learner ... returns session handle + voice endpoint
 * credentials"). Replaces voice-service's previous static shared-secret
 * bearer token with a token scoped to one session id and time-limited,
 * signed with a secret shared only between app-service and voice-service
 * (never sent to or baked into the mobile client — see
 * mobile/src/lib/voice-service/voice-connection.ts's own comment on why
 * that would be unsafe).
 *
 * Deliberately hand-rolled HMAC rather than pulling in a JWT library:
 * both services already keep their dependency lists minimal (app-service
 * has exactly `pg`+`zod`), and the actual requirement — "prove this
 * bearer was told a specific sessionId by app-service, recently" — is a
 * handful of lines with `node:crypto`, not a general-purpose claims
 * format.
 *
 * `voice-service/src/session-token.ts` mirrors this file's logic
 * exactly, the same "hand-mirrored across two independent npm projects"
 * pattern already used for the WS message shapes (see
 * voice-connection.ts's own comment on that). Keep the two in sync by
 * hand if either changes.
 */

const TOKEN_PART_SEPARATOR = '.';

/** One hour — long enough to cover a full session (PRD's sessions are on the order of minutes), short enough that a leaked token is a bounded exposure window. */
export const SESSION_TOKEN_TTL_MS = 60 * 60 * 1000;

type SessionTokenPayload = {
  sessionId: string;
  /** Unix ms. */
  exp: number;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function sign(secret: string, payloadPart: string): string {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

export type IssuedSessionToken = {
  token: string;
  expiresAt: string;
};

/**
 * Mints a token scoped to `sessionId`, expiring `SESSION_TOKEN_TTL_MS`
 * from `now`. Format: `<base64url(JSON payload)>.<base64url(HMAC-SHA256
 * of the payload part)>` — deliberately not JWT's three-part
 * header.payload.signature shape, since there's no need for an
 * algorithm-negotiation header when both sides hardcode HMAC-SHA256.
 */
export function issueSessionToken(secret: string, sessionId: string, now: number = Date.now()): IssuedSessionToken {
  const payload: SessionTokenPayload = { sessionId, exp: now + SESSION_TOKEN_TTL_MS };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signaturePart = sign(secret, payloadPart);
  return {
    token: `${payloadPart}${TOKEN_PART_SEPARATOR}${signaturePart}`,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

/**
 * Verifies a token minted by `issueSessionToken` (or, on the
 * voice-service side, its mirrored twin): checks the HMAC signature in
 * constant time, then that it hasn't expired. Returns the embedded
 * `sessionId` on success, `null` on any failure — deliberately one
 * boolean-ish outcome, not a set of distinct error types, since every
 * caller's response to "not valid" is the same (reject the connection).
 */
export function verifySessionToken(secret: string, token: string, now: number = Date.now()): { sessionId: string } | null {
  const separatorIndex = token.indexOf(TOKEN_PART_SEPARATOR);
  if (separatorIndex === -1)
    return null;
  const payloadPart = token.slice(0, separatorIndex);
  const signaturePart = token.slice(separatorIndex + 1);

  const expectedSignature = sign(secret, payloadPart);
  const providedSignatureBuffer = Buffer.from(signaturePart, 'base64url');
  const expectedSignatureBuffer = Buffer.from(expectedSignature, 'base64url');
  // timingSafeEqual throws on length mismatch rather than returning false —
  // a forged token with a wrong-length signature is exactly the case this
  // needs to handle without throwing.
  if (providedSignatureBuffer.length !== expectedSignatureBuffer.length)
    return null;
  if (!timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer))
    return null;

  let payload: SessionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as SessionTokenPayload;
  }
  catch {
    return null;
  }
  if (typeof payload.sessionId !== 'string' || typeof payload.exp !== 'number')
    return null;
  if (now >= payload.exp)
    return null;
  return { sessionId: payload.sessionId };
}
