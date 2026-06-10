import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'expo-router';
import { Text, Alert, View } from 'react-native';
import { ref, onValue, remove } from 'firebase/database';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { initFirebase, RTDB_PATHS, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

const { rtdb, db } = initFirebase();

function TabIcon({ emoji, focused, badge }: { emoji: string; focused: boolean; badge?: number }) {
  return (
    <View>
      <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>
      {!!badge && badge > 0 && (
        <View style={{ position: 'absolute', top: -4, right: -8, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </View>
  );
}

export default function OwnerLayout() {
  const { user } = useAuth();
  const listenedRef = useRef<string | null>(null);
  const [unreadChats, setUnreadChats] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, COLLECTIONS.CHATS), where('participants', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setUnreadChats(snap.docs.filter((d) => {
        const data = d.data();
        if (!data.lastMessage || !data.lastMessageAt) return false;
        const lastMsg = typeof data.lastMessageAt === 'string' ? data.lastMessageAt : data.lastMessageAt?.toDate?.().toISOString() ?? '';
        const lastRead = data.lastReadAt?.[user.uid];
        const lastReadStr = typeof lastRead === 'string' ? lastRead : lastRead?.toDate?.().toISOString() ?? '';
        return lastReadStr < lastMsg;
      }).length);
      setMatchCount(snap.docs.filter((d) => !!d.data().matchId).length);
    });
    return unsub;
  }, [user?.uid]);

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
          tabBarIcon: ({ focused }) => <TabIcon emoji="💚" focused={focused} badge={matchCount} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Mensajes',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} badge={unreadChats} />,
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
      <Tabs.Screen name="lost"      options={{ href: null }} />
      <Tabs.Screen name="vets"      options={{ href: null }} />
      <Tabs.Screen name="store"     options={{ href: null }} />
      <Tabs.Screen name="trainers"  options={{ href: null }} />
    </Tabs>
  );
}
