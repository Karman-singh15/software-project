import { Tabs } from 'expo-router';
import { Platform, Text } from 'react-native';

import { C, F } from '@/theme/tokens';

const ICONS: Record<string, [string, string]> = {
  index: ['🌿', '🍃'],
  analytics: ['📊', '📈'],
  system: ['🛰️', '🛰️'],
  reports: ['🗒️', '📋'],
  settings: ['⚙️', '⚙️'],
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const glyph = ICONS[name]?.[focused ? 1 : 0] ?? '•';
  return <Text style={{ fontSize: 19, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.leaf,
        tabBarInactiveTintColor: C.textDim,
        tabBarStyle: {
          backgroundColor: C.bgElevated,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 86 : 64,
          paddingTop: 8,
        },
        tabBarLabelStyle: { ...F.tiny, textTransform: 'none', letterSpacing: 0.2 },
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      })}>
      <Tabs.Screen name="index" options={{ title: 'Garden' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="system" options={{ title: 'Hardware' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
