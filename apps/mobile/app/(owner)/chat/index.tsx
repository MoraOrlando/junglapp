import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
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

  async function loadChats() {
    if (!user) return;
    const snap = await getDocs(
      query(
        collection(db, COLLECTIONS.CHATS),
        where('participants', 'array-contains', user.uid),
        orderBy('updatedAt', 'desc')
      )
    );
    setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chat)));
  }

  useEffect(() => { loadChats(); }, [user]);

  async function onRefresh() {
    setRefreshing(true);
    await loadChats();
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
    ? allMessages.filter((c) =>
        getOtherName(c).toLowerCase().includes(search.toLowerCase()) ||
        (c.lastMessage || '').toLowerCase().includes(search.toLowerCase())
      )
    : allMessages;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Title */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900">Messages</Text>
      </View>

      {/* Search */}
      <View className="px-4 pb-3">
        <View className="bg-white border border-gray-200 rounded-xl flex-row items-center px-3 py-2.5 gap-2">
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {/* New Matches horizontal scroll */}
        {matchChats.length > 0 && (
          <View className="mb-4">
            <View className="flex-row items-center justify-between px-5 mb-3">
              <Text className="text-gray-700 font-semibold text-sm">New Matches</Text>
              <TouchableOpacity>
                <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pl-5">
              {matchChats.map((chat) => (
                <TouchableOpacity
                  key={chat.id}
                  className="mr-4 items-center"
                  onPress={() => router.push(`/(owner)/chat/${chat.id}` as any)}
                >
                  <View
                    className="w-14 h-14 rounded-full items-center justify-center border-2"
                    style={{ backgroundColor: '#D8F3DC', borderColor: '#95D5B2' }}
                  >
                    <Text className="text-2xl">🐕</Text>
                  </View>
                  <Text className="text-xs text-gray-600 mt-1.5 font-medium max-w-16 text-center" numberOfLines={1}>
                    {getOtherName(chat)}
                  </Text>
                </TouchableOpacity>
              ))}
              <View className="w-5" />
            </ScrollView>
          </View>
        )}

        {/* Messages list */}
        <View className="px-4">
          <Text className="text-gray-700 font-semibold text-sm mb-3">Messages</Text>

          {filtered.length === 0 ? (
            <View className="items-center py-16">
              <Text className="text-5xl mb-3">💬</Text>
              <Text className="text-gray-600 font-semibold">Sin conversaciones aún</Text>
              <Text className="text-gray-400 text-sm mt-1 text-center">
                Realiza un match o ayuda a encontrar una mascota para chatear
              </Text>
            </View>
          ) : (
            <View className="gap-1">
              {filtered.map((chat) => {
                const emoji = getChatEmoji(chat);
                const name = getOtherName(chat);
                const hasNew = isRecent((chat as any).lastMessageAt || chat.updatedAt);
                return (
                  <TouchableOpacity
                    key={chat.id}
                    className="bg-white rounded-2xl px-4 py-3.5 flex-row items-center gap-3 border border-gray-100"
                    onPress={() => router.push(`/(owner)/chat/${chat.id}` as any)}
                  >
                    {/* Avatar */}
                    <View
                      className="w-12 h-12 rounded-full items-center justify-center"
                      style={{ backgroundColor: '#D8F3DC' }}
                    >
                      <Text className="text-2xl">{emoji}</Text>
                    </View>
                    {/* Content */}
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-900 text-base">{name}</Text>
                      <Text className="text-gray-400 text-sm mt-0.5" numberOfLines={1}>
                        {chat.lastMessage || 'Sin mensajes aún'}
                      </Text>
                    </View>
                    {/* Right side */}
                    <View className="items-end gap-1.5">
                      <Text className="text-gray-300 text-xs">{formatTimestamp(chat.updatedAt)}</Text>
                      {hasNew && (
                        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#52B788' }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
