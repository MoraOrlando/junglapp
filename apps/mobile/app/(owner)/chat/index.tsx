import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Chat } from '@junglapp/types';

const { db } = initFirebase();

function isRecent(updatedAt: string | undefined): boolean {
  if (!updatedAt) return false;
  return Date.now() - new Date(updatedAt).getTime() < 60 * 60 * 1000; // < 1 hour
}

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ChatListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, COLLECTIONS.CHATS), where('participants', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chat));
      setChats(data.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')));
    }, (err) => { if (__DEV__) console.log('chats list listener:', err.code); });
    return unsub;
  }, [user?.uid]);

  async function onRefresh() {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 400));
    setRefreshing(false);
  }

  function getOtherName(chat: Chat): string {
    if (!user) return 'Usuario';
    const otherId = chat.participants.find((p) => p !== user.uid);
    return otherId ? (chat.participantNames?.[otherId] || 'Usuario') : 'Usuario';
  }

  function getChatEmoji(chat: any): string {
    if (chat.chatType === 'found_pet') return '🐾';
    if (chat.matchId) return '🐕';
    return '💬';
  }

  const matchChats = chats.filter((c: any) => c.matchId && c.chatType !== 'found_pet');
  const foundChats = chats.filter((c: any) => c.chatType === 'found_pet');
  const allMessages = [...foundChats, ...matchChats];

  const filtered = search.trim()
    ? allMessages.filter(
        (c) =>
          getOtherName(c).toLowerCase().includes(search.toLowerCase()) ||
          (c.lastMessage || '').toLowerCase().includes(search.toLowerCase())
      )
    : allMessages;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* ── Title ── */}
      <View className="px-5 pt-5 pb-3">
        <Text className="text-2xl font-bold text-gray-900">Messages</Text>
      </View>

      {/* ── Search bar ── */}
      <View className="px-4 pb-4">
        <View className="bg-white border border-gray-200 rounded-2xl flex-row items-center px-4 py-3 gap-2 shadow-sm">
          <Text className="text-gray-400 text-base">🔍</Text>
          <TextInput
            className="flex-1 text-base text-gray-800"
            placeholder="Search chats..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── New Matches horizontal scroll ── */}
        {matchChats.length > 0 && (
          <View className="mb-5">
            <View className="flex-row items-center justify-between px-5 mb-3">
              <Text className="text-gray-800 font-bold text-base">New Matches</Text>
              <TouchableOpacity
                className="rounded-full px-3 py-1"
                style={{ backgroundColor: '#D8F3DC' }}
              >
                <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                  See all
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pl-5">
              {matchChats.map((chat) => (
                <TouchableOpacity
                  key={chat.id}
                  className="mr-4 items-center"
                  activeOpacity={0.8}
                  onPress={() => router.push(`/(owner)/chat/${chat.id}` as any)}
                >
                  <View
                    className="w-16 h-16 rounded-full items-center justify-center border-2"
                    style={{ backgroundColor: '#D8F3DC', borderColor: '#95D5B2' }}
                  >
                    <Text className="text-3xl">🐕</Text>
                  </View>
                  <Text
                    className="text-xs text-gray-600 mt-2 font-semibold max-w-[64px] text-center"
                    numberOfLines={1}
                  >
                    {getOtherName(chat)}
                  </Text>
                </TouchableOpacity>
              ))}
              <View className="w-5" />
            </ScrollView>
          </View>
        )}

        {/* ── Messages list ── */}
        <View className="px-4">
          <Text className="text-gray-800 font-bold text-base mb-3">Messages</Text>

          {filtered.length === 0 ? (
            <View className="items-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <Text className="text-5xl mb-3">💬</Text>
              <Text className="text-gray-700 font-semibold text-base">Sin conversaciones aún</Text>
              <Text className="text-gray-400 text-sm mt-1 text-center px-8">
                Realiza un match o ayuda a encontrar una mascota para chatear
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {filtered.map((chat) => {
                const emoji = getChatEmoji(chat);
                const name = getOtherName(chat);
                const hasNew = isRecent((chat as any).lastMessageAt || chat.updatedAt);
                return (
                  <TouchableOpacity
                    key={chat.id}
                    className="bg-white rounded-2xl px-4 py-3.5 flex-row items-center gap-3 border border-gray-100 shadow-sm"
                    activeOpacity={0.8}
                    onPress={() => router.push(`/(owner)/chat/${chat.id}` as any)}
                  >
                    {/* Avatar */}
                    <View
                      className="w-14 h-14 rounded-full items-center justify-center"
                      style={{ backgroundColor: '#D8F3DC' }}
                    >
                      <Text className="text-2xl">{emoji}</Text>
                    </View>

                    {/* Content */}
                    <View className="flex-1">
                      <Text className="font-bold text-gray-900 text-base">{name}</Text>
                      <Text className="text-gray-400 text-sm mt-0.5" numberOfLines={1}>
                        {chat.lastMessage || 'Sin mensajes aún'}
                      </Text>
                    </View>

                    {/* Right side */}
                    <View className="items-end gap-2">
                      <Text className="text-gray-300 text-xs">
                        {formatTimestamp(chat.updatedAt)}
                      </Text>
                      {hasNew && (
                        <View
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: '#52B788' }}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View className="h-10" />
      </ScrollView>
    </SafeAreaView>
  );
}
