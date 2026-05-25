import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, useColorScheme, type AppStateStatus } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import {
  defineBackgroundUploadTask,
  registerBackgroundUploadTask,
  resumePendingUploads,
} from '@/lib/backgroundUpload';

// Define the TaskManager task at module top level so Expo's runtime can
// restore it on cold launches before our React tree mounts.
defineBackgroundUploadTask();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // On first mount: resume anything the persisted store rehydrated as
    // orphaned, and register the OS-scheduled task. Both are safe to call
    // even if there is nothing to resume.
    void resumePendingUploads();
    void registerBackgroundUploadTask();

    const subscription = AppState.addEventListener('change', (next) => {
      const wasInactive = appState.current.match(/inactive|background/);
      appState.current = next;
      // Each time the app comes back to the foreground, retry orphaned items.
      if (wasInactive && next === 'active') {
        void resumePendingUploads();
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
