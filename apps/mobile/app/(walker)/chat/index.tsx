import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { useBlockedUserIds } from '../../../lib/useBlockedUserIds';
import type { Chat } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#2D6A4F';

function isUnread(chat: any, userId: string): boolean {
  if (!chat.lastMessage || !chat.lastMessageAt) return false;
  const lastMsg = typeof chat.lastMessageAt === 'string'
    ? chat.lastMessageAt
    : chat.lastMessageAt?.toDate?.().toISOString() ?? '';
  const lastRead = chat.lastReadAt?.[userId];
  const lastReadStr = typeof lastRead === 'string'
    ? lastRead
    : lastRead?.toDate?.().toISOString() ?? '';
  return lastReadStr < lastMsg;
}

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString('es-CL', { month: 'short', day: 'numeric' });
}

export default function WalkerChatListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const blockedUserIds = useBlockedUserIds();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, COLLECTIONS.CHATS), where('participants', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chat));
      setChats(data.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')));
    }, () => {});
    return unsub;
  }, [user?.uid]);

  const visibleChats = chats.filter((c) => {
    const otherId = c.participants.find((p) => p !== user?.uid);
    return !otherId || !blockedUserIds.has(otherId);
  });

  function getOtherName(chat: Chat): string {
    if (!user) return 'Dueño';
    const otherId = chat.participants.find((p) => p !== user.uid);
    return otherId ? (chat.participantNames?.[otherId] || 'Dueño') : 'Dueño';
  }

  async function onRefresh() {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 400));
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F0FDF4' }} edges={['top']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#14532D' }}>Mensajes 💬</Text>
        <Text style={{ color: '#4B5563', fontSize: 13, marginTop: 4 }}>Conversaciones con dueños de mascotas</Text>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
        showsVerticalScrollIndicator={false}
      >
        {visibleChats.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 15, fontWeight: '600' }}>Sin conversaciones aún</Text>
            <Text style={{ color: '#D1D5DB', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
              Los dueños de mascotas te escribirán aquí
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8, paddingBottom: 24 }}>
            {visibleChats.map((chat) => {
              const name = getOtherName(chat);
              const hasNew = user ? isUnread(chat, user.uid) : false;
              return (
                <TouchableOpacity
                  key={chat.id}
                  onPress={() => router.push(`/(walker)/chat/${chat.id}` as any)}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderWidth: 1,
                    borderColor: hasNew ? '#95D5B2' : '#F1F5F9',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                >
                  <View style={{
                    width: 48, height: 48, borderRadius: 24,
                    backgroundColor: '#ECFDF5',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 22 }}>🐾</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15 }}>{name}</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                      {chat.lastMessage || 'Sin mensajes aún'}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={{ color: '#D1D5DB', fontSize: 11 }}>
                      {formatTimestamp(chat.updatedAt)}
                    </Text>
                    {hasNew && (
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN }} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
