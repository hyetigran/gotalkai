import { loadEnv } from './env';

describe('loadEnv', () => {
  const validBase = {
    SESSION_TOKEN_SECRET: 'a'.repeat(32),
    ANTHROPIC_API_KEY: 'sk-ant-test-key',
    ELEVENLABS_API_KEY: 'el-test-key',
    ELEVENLABS_VALENTINA_VOICE_ID: 'voice-test-id',
  };

  it('accepts a minimal valid environment and applies defaults', () => {
    const env = loadEnv(validBase);
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SESSION_TOKEN_SECRET).toBe(validBase.SESSION_TOKEN_SECRET);
  });

  it('coerces a string PORT to a number', () => {
    const env = loadEnv({ ...validBase, PORT: '9090' });
    expect(env.PORT).toBe(9090);
  });

  it('rejects a missing session token secret', () => {
    expect(() => loadEnv({})).toThrow(/SESSION_TOKEN_SECRET/);
  });

  it('rejects a session token secret shorter than 32 characters', () => {
    expect(() => loadEnv({ ...validBase, SESSION_TOKEN_SECRET: 'short' })).toThrow(/SESSION_TOKEN_SECRET/);
  });

  function withoutField(field: keyof typeof validBase): Record<string, string> {
    const copy: Record<string, string> = { ...validBase };
    delete copy[field];
    return copy;
  }

  it('rejects a missing Anthropic API key', () => {
    expect(() => loadEnv(withoutField('ANTHROPIC_API_KEY'))).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('rejects a missing ElevenLabs API key', () => {
    expect(() => loadEnv(withoutField('ELEVENLABS_API_KEY'))).toThrow(/ELEVENLABS_API_KEY/);
  });

  it('rejects a missing ElevenLabs Valentina voice ID', () => {
    expect(() => loadEnv(withoutField('ELEVENLABS_VALENTINA_VOICE_ID'))).toThrow(/ELEVENLABS_VALENTINA_VOICE_ID/);
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
      expect((error as Error).message).toContain('SESSION_TOKEN_SECRET');
      expect((error as Error).message).toContain('NODE_ENV');
    }
  });
});
