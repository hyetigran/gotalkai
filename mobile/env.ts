import z from 'zod';

import packageJSON from './package.json';

// Single unified environment schema
const envSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'preview', 'production']),
  EXPO_PUBLIC_NAME: z.string(),
  EXPO_PUBLIC_SCHEME: z.string(),
  EXPO_PUBLIC_BUNDLE_ID: z.string(),
  EXPO_PUBLIC_PACKAGE: z.string(),
  EXPO_PUBLIC_VERSION: z.string(),
  EXPO_PUBLIC_API_URL: z.string().url(),
  /** app-service's base URL (ARCHITECTURE.md §3.2) — separate from EXPO_PUBLIC_API_URL, which is still the scaffold's demo feed API. */
  EXPO_PUBLIC_APP_SERVICE_URL: z.string().url(),
  /** voice-service's WebSocket base URL (ARCHITECTURE.md §3.2/§6) — `ws://`/`wss://`, not `http(s)://`; `VoiceConnection` (mobile/src/lib/voice-service/voice-connection.ts) appends nothing else to it. Was missing entirely until docs/adr/0026's live-pipeline wiring needed somewhere real to point at. */
  EXPO_PUBLIC_VOICE_SERVICE_URL: z.string().url(),
  EXPO_PUBLIC_ASSOCIATED_DOMAIN: z.string().url().optional(),
  EXPO_PUBLIC_VAR_NUMBER: z.number(),
  EXPO_PUBLIC_VAR_BOOL: z.boolean(),

  // only available for app.config.ts usage
  APP_BUILD_ONLY_VAR: z.string().optional(),
});

// Config records per environment
const EXPO_PUBLIC_APP_ENV = (process.env.EXPO_PUBLIC_APP_ENV
  ?? 'development') as z.infer<typeof envSchema>['EXPO_PUBLIC_APP_ENV'];

const BUNDLE_IDS = {
  development: 'com.mobile.development',
  preview: 'com.mobile.preview',
  production: 'com.mobile',
} as const;

const PACKAGES = {
  development: 'com.mobile.development',
  preview: 'com.mobile.preview',
  production: 'com.mobile',
} as const;

const SCHEMES = {
  development: 'mobile',
  preview: 'mobile.preview',
  production: 'mobile',
} as const;

const NAME = 'mobile';

// Check if strict validation is required (before prebuild)
const STRICT_ENV_VALIDATION = process.env.STRICT_ENV_VALIDATION === '1';

// Build env object
const _env: z.infer<typeof envSchema> = {
  EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_NAME: NAME,
  EXPO_PUBLIC_SCHEME: SCHEMES[EXPO_PUBLIC_APP_ENV],
  EXPO_PUBLIC_BUNDLE_ID: BUNDLE_IDS[EXPO_PUBLIC_APP_ENV],
  EXPO_PUBLIC_PACKAGE: PACKAGES[EXPO_PUBLIC_APP_ENV],
  EXPO_PUBLIC_VERSION: packageJSON.version,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? '',
  EXPO_PUBLIC_APP_SERVICE_URL: process.env.EXPO_PUBLIC_APP_SERVICE_URL ?? 'http://localhost:8081',
  EXPO_PUBLIC_VOICE_SERVICE_URL: process.env.EXPO_PUBLIC_VOICE_SERVICE_URL ?? 'ws://localhost:8080',
  EXPO_PUBLIC_ASSOCIATED_DOMAIN: process.env.EXPO_PUBLIC_ASSOCIATED_DOMAIN,
  EXPO_PUBLIC_VAR_NUMBER: Number(process.env.EXPO_PUBLIC_VAR_NUMBER ?? 0),
  EXPO_PUBLIC_VAR_BOOL: process.env.EXPO_PUBLIC_VAR_BOOL === 'true',
  APP_BUILD_ONLY_VAR: process.env.APP_BUILD_ONLY_VAR,
};

function getValidatedEnv(env: z.infer<typeof envSchema>) {
  const parsed = envSchema.safeParse(env);

  if (parsed.success === false) {
    const errorMessage
      = `❌ Invalid environment variables:${
        JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)
      }\n❌ Missing variables in .env file for APP_ENV=${EXPO_PUBLIC_APP_ENV}`
      + `\n💡 Tip: If you recently updated the .env file, try restarting with -c flag to clear the cache.`;

    if (STRICT_ENV_VALIDATION) {
      console.error(errorMessage);
      throw new Error('Invalid environment variables');
    }
  }
  else {
    console.log('✅ Environment variables validated successfully');
  }

  return parsed.success ? parsed.data : env;
}

const Env = STRICT_ENV_VALIDATION ? getValidatedEnv(_env) : _env;

export default Env;
