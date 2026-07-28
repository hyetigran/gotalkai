import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as React from 'react';
import { StyleSheet } from 'react-native';
import FlashMessage from 'react-native-flash-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useThemeConfig } from '@/components/ui/use-theme-config';
import { hydrateAuth, useAuthStore as useAuth } from '@/features/auth/use-auth-store';

import { APIProvider } from '@/lib/api';
import { loadSelectedTheme } from '@/lib/hooks/use-selected-theme';
// Import  global CSS file
import '../global.css';

export { ErrorBoundary } from 'expo-router';

// eslint-disable-next-line react-refresh/only-export-components
export const unstable_settings = {
  // `index` (redirects to `/open`) is the true root now — `(app)` no longer
  // implicitly owns `/` since its own index route was renamed to `feed`.
  initialRouteName: 'index',
};

hydrateAuth();
loadSelectedTheme();
// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

export default function RootLayout() {
  // This effect lives here (not in a route-group layout like `(app)`) because
  // routes can be unmounted by navigation before their own effects fire — a
  // fresh install redirects out of `(app)` on its very first render, which
  // was cancelling a splash-hide timer placed there before it ever ran. The
  // root layout is mounted for the app's entire lifetime, so it's the only
  // safe place to guarantee this fires exactly once.
  const status = useAuth.use.status();
  React.useEffect(() => {
    if (status !== 'idle') {
      SplashScreen.hideAsync();
    }
  }, [status]);

  return (
    <Providers>
      {/* Every screen in this app builds its own header per the design mockup
          — the native Stack header defaults to visible per-route, which was
          stacking a second, unstyled header above each one. */}
      <Stack screenOptions={{ headerShown: false }} />
    </Providers>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
  const theme = useThemeConfig();
  return (
    <GestureHandlerRootView
      style={styles.container}
      // eslint-disable-next-line better-tailwindcss/no-unknown-classes
      className={theme.dark ? `dark` : undefined}
    >
      <KeyboardProvider>
        <ThemeProvider value={theme}>
          <APIProvider>
            <BottomSheetModalProvider>
              {children}
              <FlashMessage position="top" />
            </BottomSheetModalProvider>
          </APIProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
