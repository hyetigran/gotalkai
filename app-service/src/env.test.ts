import { loadEnv } from './env';

describe('loadEnv', () => {
  const validBase = {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/app_service',
  };

  it('accepts a minimal valid environment and applies defaults', () => {
    const env = loadEnv(validBase);
    expect(env.PORT).toBe(8081);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe(validBase.DATABASE_URL);
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
