import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../context/AuthContext';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

const ADMIN_COLOR = '#7C3AED';

export default function SupportLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && (!user || user.role !== 'support')) router.replace('/(auth)');
  }, [user, loading]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ADMIN_COLOR,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingBottom: 8, paddingTop: 4, height: 65 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Panel', tabBarIcon: ({ focused }) => <TabIcon emoji="🛡️" focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }} />
      {/* Hidden routes — reachable from the Panel buttons, not shown as tabs */}
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="users" options={{ href: null }} />
      <Tabs.Screen name="vets" options={{ href: null }} />
      <Tabs.Screen name="stores" options={{ href: null }} />
      <Tabs.Screen name="trainers" options={{ href: null }} />
      <Tabs.Screen name="walkers" options={{ href: null }} />
      <Tabs.Screen name="groomers" options={{ href: null }} />
      <Tabs.Screen name="places" options={{ href: null }} />
      <Tabs.Screen name="promotions" options={{ href: null }} />
    </Tabs>
  );
}
