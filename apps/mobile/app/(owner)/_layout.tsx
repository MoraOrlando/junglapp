import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { Text, Alert } from 'react-native';
import { ref, onValue, remove } from 'firebase/database';
import { initFirebase, RTDB_PATHS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

const { rtdb } = initFirebase();

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function OwnerLayout() {
  const { user } = useAuth();
  const listenedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    if (listenedRef.current === user.uid) return;
    listenedRef.current = user.uid;

    const notifPath = ref(rtdb, `${RTDB_PATHS.NOTIFICATIONS}/${user.uid}`);

    const unsubscribe = onValue(notifPath, (snapshot) => {
      if (!snapshot.exists()) return;
      const notifications = snapshot.val() as Record<string, any>;

      Object.entries(notifications).forEach(([apptId, notif]) => {
        if (notif.read) return;

        if (notif.type === 'vet_arrived') {
          // Mark as read immediately so it doesn't fire again
          remove(ref(rtdb, `${RTDB_PATHS.NOTIFICATIONS}/${user.uid}/${apptId}`));

          Alert.alert(
            '🩺 Tu veterinario llegó',
            `${notif.vetName} ha llegado a la consulta.\n\nPor favor verifica su identidad antes de comenzar.`,
            [{ text: 'Entendido', style: 'default' }]
          );
        }
      });
    });

    return () => unsubscribe();
  }, [user?.uid]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2D6A4F',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingBottom: 8,
          paddingTop: 4,
          height: 65,
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
        name="near"
        options={{
          title: 'Cerca',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📍" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="match"
        options={{
          title: 'Match',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💚" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />

      {/* ── Hidden routes ── */}
      <Tabs.Screen name="pets"      options={{ href: null }} />
      <Tabs.Screen name="chat"      options={{ href: null }} />
      <Tabs.Screen name="lost"      options={{ href: null }} />
      <Tabs.Screen name="vets"      options={{ href: null }} />
      <Tabs.Screen name="store"     options={{ href: null }} />
      <Tabs.Screen name="trainers"  options={{ href: null }} />
    </Tabs>
  );
}
