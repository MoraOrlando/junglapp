import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function StoreLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!loading && user && user.role !== 'store') router.replace('/(auth)');
  }, [user, loading]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#D97706',
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
          title: 'Productos',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Servicios',
          tabBarIcon: ({ focused }) => <TabIcon emoji="✂️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🛍️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Tienda',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏪" focused={focused} />,
        }}
      />
      <Tabs.Screen name="product" options={{ href: null }} />
      <Tabs.Screen name="chat"    options={{ href: null }} />
    </Tabs>
  );
}
