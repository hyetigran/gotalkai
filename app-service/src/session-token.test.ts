import { issueSessionToken, SESSION_TOKEN_TTL_MS, verifySessionToken } from './session-token';

const SECRET = 'test-secret-0123456789abcdef0123456789';
const OTHER_SECRET = 'a-completely-different-secret-abcdef0123';
const SESSION_ID = '57d4a515-fe86-450e-82c9-8dd710824c3f';

describe('session-token', () => {
  it('round-trips: a token issued for a session id verifies back to that same session id', () => {
    const { token } = issueSessionToken(SECRET, SESSION_ID);
    const verified = verifySessionToken(SECRET, token);
    expect(verified?.sessionId).toBe(SESSION_ID);
  });

  it('reports an expiry SESSION_TOKEN_TTL_MS after issuance', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const { expiresAt } = issueSessionToken(SECRET, SESSION_ID, now);
    expect(Date.parse(expiresAt)).toBe(now + SESSION_TOKEN_TTL_MS);
  });

  it('rejects a token verified against the wrong secret', () => {
    const { token } = issueSessionToken(SECRET, SESSION_ID);
    expect(verifySessionToken(OTHER_SECRET, token)).toBeNull();
  });

  it('rejects a token whose payload was tampered with (session id swapped)', () => {
    const { token } = issueSessionToken(SECRET, SESSION_ID);
    const [payloadPart, signaturePart] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sessionId: 'a-different-session-id', exp: Date.now() + 1000 }), 'utf8').toString('base64url');
    expect(verifySessionToken(SECRET, `${tamperedPayload}.${signaturePart}`)).toBeNull();
    // sanity: the original is still valid, proving the tamper (not some
    // unrelated bug) is what triggered the rejection above.
    expect(verifySessionToken(SECRET, `${payloadPart}.${signaturePart}`)?.sessionId).toBe(SESSION_ID);
  });

  it('rejects an expired token', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const { token } = issueSessionToken(SECRET, SESSION_ID, now);
    const justAfterExpiry = now + SESSION_TOKEN_TTL_MS;
    expect(verifySessionToken(SECRET, token, justAfterExpiry)).toBeNull();
  });

  it('accepts a token one millisecond before expiry', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const { token } = issueSessionToken(SECRET, SESSION_ID, now);
    const justBeforeExpiry = now + SESSION_TOKEN_TTL_MS - 1;
    expect(verifySessionToken(SECRET, token, justBeforeExpiry)?.sessionId).toBe(SESSION_ID);
  });

  it('rejects a malformed token with no separator', () => {
    expect(verifySessionToken(SECRET, 'not-a-real-token')).toBeNull();
  });

  it('rejects a token with a garbage payload part', () => {
    expect(verifySessionToken(SECRET, 'not-valid-base64url-json.somesignature')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(verifySessionToken(SECRET, '')).toBeNull();
  });
});
