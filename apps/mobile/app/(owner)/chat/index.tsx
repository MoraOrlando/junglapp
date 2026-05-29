import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Chat } from '@junglapp/types';

const { db } = initFirebase();

export default function ChatListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
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

  function getOtherName(chat: Chat) {
    if (!user) return 'Usuario';
    const otherId = chat.participants.find((p) => p !== user.uid);
    return otherId ? (chat.participantNames[otherId] || 'Usuario') : 'Usuario';
  }

  function getChatMeta(chat: any): { emoji: string; label: string; color: string } {
    if (chat.chatType === 'found_pet') return { emoji: '🐾', label: 'Mascota encontrada', color: 'bg-green-100' };
    if (chat.matchId) return { emoji: '💚', label: 'Match', color: 'bg-pink-100' };
    return { emoji: '💬', label: 'Mensaje', color: 'bg-primary-100' };
  }

  const matchChats = chats.filter((c: any) => c.matchId && c.chatType !== 'found_pet');
  const foundChats = chats.filter((c: any) => c.chatType === 'found_pet');

  function renderChat(chat: Chat) {
    const meta = getChatMeta(chat);
    return (
      <TouchableOpacity
        key={chat.id}
        className="bg-white rounded-2xl p-4 flex-row items-center gap-3 shadow-sm border border-gray-100 mb-2"
        onPress={() => router.push(`/(owner)/chat/${chat.id}` as any)}
      >
        <View className={`${meta.color} rounded-full w-12 h-12 items-center justify-center`}>
          <Text className="text-2xl">{meta.emoji}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="font-semibold text-gray-800">{getOtherName(chat)}</Text>
            <View className="bg-gray-100 rounded-full px-2 py-0.5">
              <Text className="text-gray-400 text-xs">{meta.label}</Text>
            </View>
          </View>
          <Text className="text-gray-400 text-sm mt-0.5" numberOfLines={1}>
            {chat.lastMessage || 'Sin mensajes'}
          </Text>
        </View>
        {chat.updatedAt && (
          <Text className="text-gray-300 text-xs">
            {new Date(chat.updatedAt).toLocaleDateString('es-CL', { month: 'short', day: 'numeric' })}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-2">
        <Text className="text-2xl font-bold text-primary-700">Mensajes 💬</Text>
      </View>

      <ScrollView
        className="flex-1 px-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {chats.length === 0 ? (
          <View className="items-center py-20">
            <Text className="text-6xl mb-4">💬</Text>
            <Text className="text-gray-600 font-semibold">Sin conversaciones aún</Text>
            <Text className="text-gray-400 text-sm mt-2 text-center">
              Realiza un match o ayuda a encontrar una mascota extraviada para chatear
            </Text>
          </View>
        ) : (
          <View className="pb-6 mt-2">
            {/* Found pet chats first — they're urgent */}
            {foundChats.length > 0 && (
              <>
                <Text className="text-sm font-semibold text-green-700 mb-2 mt-2">🐾 Mascotas encontradas</Text>
                {foundChats.map(renderChat)}
              </>
            )}

            {matchChats.length > 0 && (
              <>
                <Text className="text-sm font-semibold text-gray-500 mb-2 mt-3">💚 Match</Text>
                {matchChats.map(renderChat)}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
