import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ref, push, onValue, off, serverTimestamp } from 'firebase/database';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, RTDB_PATHS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Chat, Message } from '@junglapp/types';

const { db, rtdb } = initFirebase();

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'TODAY';
  return d
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();
}

function groupByDate(messages: Message[]): Array<{ label: string; messages: Message[] }> {
  const groups: Record<string, Message[]> = {};
  for (const msg of messages) {
    const label = formatDateLabel(msg.createdAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(msg);
  }
  return Object.entries(groups).map(([label, messages]) => ({ label, messages }));
}

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function getOtherName(): string {
    if (!chat || !user) return 'Chat';
    const otherId = chat.participants.find((p) => p !== user.uid);
    return otherId ? (chat.participantNames?.[otherId] || 'Usuario') : 'Usuario';
  }

  const chatType = (chat as any)?.chatType;
  const headerEmoji = chatType === 'found_pet' ? '🐾' : '🐕';

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.CHATS, id)).then((snap) => {
      if (snap.exists()) setChat({ id: snap.id, ...snap.data() } as Chat);
    });

    const msgsRef = ref(rtdb, `${RTDB_PATHS.MESSAGES}/${id}`);
    onValue(msgsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgs = Object.entries(data).map(([msgId, msg]: [string, any]) => ({
          id: msgId,
          chatId: id,
          ...msg,
        })) as Message[];
        msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(msgs);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    });

    return () => off(msgsRef);
  }, [id]);

  async function sendMessage(extraImageUrl?: string) {
    if (!text.trim() && !extraImageUrl) return;
    if (!user || !id) return;
    const msgText = text.trim();
    setText('');

    const msgsRef = ref(rtdb, `${RTDB_PATHS.MESSAGES}/${id}`);
    await push(msgsRef, {
      senderId: user.uid,
      senderName: user.name,
      text: msgText,
      ...(extraImageUrl ? { imageUrl: extraImageUrl } : {}),
      createdAt: new Date().toISOString(),
    });

    await updateDoc(doc(db, COLLECTIONS.CHATS, id), {
      lastMessage: extraImageUrl ? '📷 Foto' : msgText,
      lastMessageAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async function pickAndSendImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setUploading(true);
    try {
      const url = await uploadImage(uri);
      await sendMessage(url);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
    }
  }

  const groups = groupByDate(messages);
  const otherName = getOtherName();

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* ── Header ── */}
      <View
        className="flex-row items-center px-4 py-3 gap-3 border-b border-gray-100"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <TouchableOpacity className="pr-1" onPress={() => router.back()}>
          <Text className="text-2xl text-gray-600">←</Text>
        </TouchableOpacity>
        <View
          className="w-11 h-11 rounded-full items-center justify-center"
          style={{ backgroundColor: '#D8F3DC' }}
        >
          <Text className="text-2xl">{headerEmoji}</Text>
        </View>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 text-base leading-tight">{otherName}</Text>
          <Text className="text-gray-400 text-xs">
            {chatType === 'found_pet' ? 'Mascota encontrada' : `with ${otherName}`}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* ── Messages ── */}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-4 py-3"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && (
            <View className="items-center py-20">
              <Text className="text-4xl mb-3">🐾</Text>
              <Text className="text-gray-400 text-sm">¡Sé el primero en escribir!</Text>
            </View>
          )}

          {groups.map(({ label, messages: groupMsgs }) => (
            <View key={label}>
              {/* Date separator */}
              <View className="flex-row items-center gap-3 my-5">
                <View className="flex-1 h-px bg-gray-200" />
                <Text className="text-gray-400 text-xs font-semibold tracking-widest">{label}</Text>
                <View className="flex-1 h-px bg-gray-200" />
              </View>

              {groupMsgs.map((msg) => {
                const isMe = msg.senderId === user?.uid;
                return (
                  <View
                    key={msg.id}
                    className={`mb-4 flex-row ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <View className={`max-w-xs ${isMe ? 'items-end' : 'items-start'}`}>
                      {/* Image if present */}
                      {msg.imageUrl ? (
                        <Image
                          source={{ uri: msg.imageUrl }}
                          style={{ width: 208, height: 160, borderRadius: 16, marginBottom: 4 }}
                          resizeMode="cover"
                        />
                      ) : null}

                      {/* Text bubble */}
                      {msg.text ? (
                        <View
                          className={`rounded-2xl px-4 py-3 ${
                            isMe ? 'rounded-tr-sm' : 'rounded-tl-sm bg-white border border-gray-100'
                          }`}
                          style={isMe ? { backgroundColor: '#2D6A4F' } : {}}
                        >
                          <Text className={isMe ? 'text-white' : 'text-gray-800'}>
                            {msg.text}
                          </Text>
                        </View>
                      ) : null}

                      {/* Timestamp */}
                      <Text className="text-gray-300 text-xs mt-1.5 px-1">
                        {formatTime(msg.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* ── Input bar ── */}
        <View className="flex-row items-center px-3 py-2.5 bg-white border-t border-gray-100 gap-2">
          {/* Camera button */}
          <TouchableOpacity
            className="w-10 h-10 rounded-full items-center justify-center bg-gray-100"
            onPress={pickAndSendImage}
            disabled={uploading}
          >
            <Text className="text-lg">{uploading ? '⏳' : '📷'}</Text>
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-base text-gray-800"
            placeholder="mensaje con foto..."
            placeholderTextColor="#9CA3AF"
            value={text}
            onChangeText={setText}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
          />

          {/* Emoji button */}
          <TouchableOpacity className="w-9 h-9 items-center justify-center">
            <Text className="text-2xl">😊</Text>
          </TouchableOpacity>

          {/* Send button */}
          <TouchableOpacity
            className={`w-10 h-10 rounded-full items-center justify-center ${!text.trim() ? 'opacity-40' : ''}`}
            style={{ backgroundColor: '#2D6A4F' }}
            onPress={() => sendMessage()}
            disabled={!text.trim()}
          >
            <Text className="text-white text-lg font-bold">↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
