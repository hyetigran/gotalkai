import type { ConfigContext, ExpoConfig } from '@expo/config';

import type { AppIconBadgeConfig } from 'app-icon-badge/types';

import 'tsx/cjs';

// adding lint exception as we need to import tsx/cjs before env.ts is
// imported — and, by the same requirement, before font-manifest.ts, since
// both rely on tsx/cjs's loader hook to import a .ts file at all. Their
// order relative to *each other* doesn't matter, only relative to tsx/cjs.
// eslint-disable-next-line perfectionist/sort-imports
import { fontManifest } from './src/components/ui/font-manifest';
// eslint-disable-next-line perfectionist/sort-imports
import Env from './env';

const EXPO_ACCOUNT_OWNER = 'obytes';
const EAS_PROJECT_ID = 'c3e1075b-6fe7-4686-aa49-35b46a229044';

const appIconBadgeConfig: AppIconBadgeConfig = {
  enabled: Env.EXPO_PUBLIC_APP_ENV !== 'production',
  badges: [
    {
      text: Env.EXPO_PUBLIC_APP_ENV,
      type: 'banner',
      color: 'white',
    },
    {
      text: Env.EXPO_PUBLIC_VERSION.toString(),
      type: 'ribbon',
      color: 'white',
    },
  ],
};

// Registered as one family per exact style (not weight-grouped) so the iOS
// PostScript name and the Android fontFamily name are identical strings —
// no per-platform font-weight resolution to get wrong. Cyrillic + stress-mark
// (U+0301) coverage verified against the source .ttf files — see
// src/components/ui/design-tokens.test.ts. File paths come from
// `fontManifest`, the single source of truth also used by that test.
const expoFontPluginConfig: [string, Record<string, unknown>] = [
  'expo-font',
  {
    ios: {
      fonts: [
        'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
        'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
        'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
        'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
        ...fontManifest.map(font => font.path),
      ],
    },
    android: {
      fonts: [
        {
          fontFamily: 'Inter',
          fontDefinitions: [
            {
              path: 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
              weight: 400,
            },
            {
              path: 'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
              weight: 500,
            },
            {
              path: 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
              weight: 600,
            },
            {
              path: 'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
              weight: 700,
            },
          ],
        },
        ...fontManifest.map(font => ({
          fontFamily: font.family,
          fontDefinitions: [
            {
              path: font.path,
              weight: font.weight,
              ...('style' in font ? { style: font.style } : {}),
            },
          ],
        })),
      ],
    },
  },
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: Env.EXPO_PUBLIC_NAME,
  description: `${Env.EXPO_PUBLIC_NAME} Mobile App`,
  owner: EXPO_ACCOUNT_OWNER,
  scheme: Env.EXPO_PUBLIC_SCHEME,
  slug: 'obytesapp',
  version: Env.EXPO_PUBLIC_VERSION.toString(),
  orientation: 'portrait',
  icon: './assets/logo.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  updates: {
    fallbackToCacheTimeout: 0,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: Env.EXPO_PUBLIC_BUNDLE_ID,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  experiments: {
    typedRoutes: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#2E3C4B',
    },
    package: Env.EXPO_PUBLIC_PACKAGE,
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        backgroundColor: '#2E3C4B',
        image: './assets/splash.png',
        // Full-bleed portrait artwork (853x1844, close to a phone's own aspect
        // ratio) meant to fill the screen, not a small centered mark —
        // 'cover' instead of the default 'contain', and no imageWidth (that
        // option only makes sense for a partial-width centered image).
        resizeMode: 'cover',
      },
    ],
    expoFontPluginConfig,
    'expo-asset',
    [
      'expo-audio',
      {
        microphonePermission: 'Валентина needs to hear you to have a conversation.',
      },
    ],
    'expo-localization',
    'expo-router',
    ['app-icon-badge', appIconBadgeConfig],
    ['react-native-edge-to-edge'],
  ],
  extra: {
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },
});
