import { loadEnv } from './env';

describe('loadEnv', () => {
  const validBase = {
    VOICE_SERVICE_AUTH_TOKEN: 'a'.repeat(32),
    ANTHROPIC_API_KEY: 'sk-ant-test-key',
    ELEVENLABS_API_KEY: 'el-test-key',
    ELEVENLABS_VALENTINA_VOICE_ID: 'voice-test-id',
  };

  it('accepts a minimal valid environment and applies defaults', () => {
    const env = loadEnv(validBase);
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('development');
    expect(env.VOICE_SERVICE_AUTH_TOKEN).toBe(validBase.VOICE_SERVICE_AUTH_TOKEN);
  });

  it('coerces a string PORT to a number', () => {
    const env = loadEnv({ ...validBase, PORT: '9090' });
    expect(env.PORT).toBe(9090);
  });

  it('rejects a missing auth token', () => {
    expect(() => loadEnv({})).toThrow(/VOICE_SERVICE_AUTH_TOKEN/);
  });

  it('rejects an auth token shorter than 16 characters', () => {
    expect(() => loadEnv({ ...validBase, VOICE_SERVICE_AUTH_TOKEN: 'short' })).toThrow(/VOICE_SERVICE_AUTH_TOKEN/);
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
      expect((error as Error).message).toContain('VOICE_SERVICE_AUTH_TOKEN');
      expect((error as Error).message).toContain('NODE_ENV');
    }
  });
});
