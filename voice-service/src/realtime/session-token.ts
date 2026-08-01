import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verification side of app-service/src/session-token.ts's real
 * per-session credential issuance (docs/adr/0017's disclosed gap,
 * closed). Hand-mirrored across these two independent npm projects — the
 * same pattern already used for the WS message shapes (see
 * voice-connection.ts's own comment on that) — because there's no shared
 * package between them. Keep the two files' logic in sync by hand if
 * either changes.
 *
 * This service only ever verifies tokens (it never issues them — minting
 * is app-service's job, `POST /sessions`'s response), so `issueSessionToken`
 * isn't duplicated here.
 */

const TOKEN_PART_SEPARATOR = '.';

type SessionTokenPayload = {
  sessionId: string;
  /** Unix ms. */
  exp: number;
};

function sign(secret: string, payloadPart: string): string {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

/**
 * Verifies a token minted by app-service's `issueSessionToken`: checks
 * the HMAC signature in constant time, then that it hasn't expired.
 * Returns the embedded `sessionId` on success, `null` on any failure —
 * deliberately one boolean-ish outcome, not a set of distinct error
 * types, since every caller's response to "not valid" is the same
 * (reject the connection).
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
