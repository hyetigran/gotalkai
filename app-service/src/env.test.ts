import { loadEnv } from './env';

describe('loadEnv', () => {
  const validBase = {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/app_service',
    SESSION_TOKEN_SECRET: 'a'.repeat(32),
  };

  it('accepts a minimal valid environment and applies defaults', () => {
    const env = loadEnv(validBase);
    expect(env.PORT).toBe(8082);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe(validBase.DATABASE_URL);
    expect(env.RETENTION_DAYS).toBe(180);
    expect(env.DAILY_SESSION_CAP).toBe(1);
  });

  it('coerces a string RETENTION_DAYS to a number', () => {
    const env = loadEnv({ ...validBase, RETENTION_DAYS: '30' });
    expect(env.RETENTION_DAYS).toBe(30);
  });

  it('rejects a non-positive RETENTION_DAYS', () => {
    expect(() => loadEnv({ ...validBase, RETENTION_DAYS: '0' })).toThrow();
  });

  it('coerces a string DAILY_SESSION_CAP to a number', () => {
    const env = loadEnv({ ...validBase, DAILY_SESSION_CAP: '3' });
    expect(env.DAILY_SESSION_CAP).toBe(3);
  });

  it('rejects a non-positive DAILY_SESSION_CAP', () => {
    expect(() => loadEnv({ ...validBase, DAILY_SESSION_CAP: '0' })).toThrow();
  });

  it('coerces a string PORT to a number', () => {
    const env = loadEnv({ ...validBase, PORT: '9090' });
    expect(env.PORT).toBe(9090);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects an empty DATABASE_URL', () => {
    expect(() => loadEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-positive port', () => {
    expect(() => loadEnv({ ...validBase, PORT: '-1' })).toThrow();
    expect(() => loadEnv({ ...validBase, PORT: '0' })).toThrow();
  });

  it('rejects an unrecognized NODE_ENV', () => {
    expect(() => loadEnv({ ...validBase, NODE_ENV: 'staging' })).toThrow();
  });

  it('rejects a missing SESSION_TOKEN_SECRET', () => {
    expect(() => loadEnv({ DATABASE_URL: validBase.DATABASE_URL })).toThrow(/SESSION_TOKEN_SECRET/);
  });

  it('rejects a SESSION_TOKEN_SECRET shorter than 32 characters', () => {
    expect(() => loadEnv({ ...validBase, SESSION_TOKEN_SECRET: 'too-short' })).toThrow(/SESSION_TOKEN_SECRET/);
  });

  it('throws a readable message listing every issue, not a raw ZodError', () => {
    try {
      loadEnv({ NODE_ENV: 'staging' });
      throw new Error('expected loadEnv to throw');
    }
    catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Invalid environment configuration');
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).toContain('NODE_ENV');
    }
  });
});
