import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { AlertNotifier } from '@/components/alert-notifier';
import { GardenProvider } from '@/store/garden';
import { C } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GardenProvider>
        <AlertNotifier />
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.bg },
              animation: 'slide_from_right',
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
        </View>
      </GardenProvider>
    </SafeAreaProvider>
  );
}
