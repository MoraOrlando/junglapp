import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function GroomingLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!loading && (!user || user.role !== 'grooming')) router.replace('/(auth)');
  }, [user, loading]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#9333EA',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingBottom: Math.max(8, insets.bottom),
          paddingTop: 4,
          height: 55 + Math.max(8, insets.bottom),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Horarios',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Mi Perfil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
