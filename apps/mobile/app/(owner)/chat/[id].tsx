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
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ref, push, onValue, off, query, limitToLast, serverTimestamp, set } from 'firebase/database';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, RTDB_PATHS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { ReportBlockButton } from '../../../components/ReportBlockButton';
import { isBlockedByRecipient } from '../../../lib/checkBlocked';
import { logChatMessageSent } from '../../../lib/analytics';
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
  const [showProfile, setShowProfile] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function getOtherId(): string | null {
    if (!chat || !user) return null;
    return chat.participants.find((p) => p !== user.uid) ?? null;
  }

  function getOtherName(): string {
    if (!chat || !user) return 'Chat';
    const otherId = getOtherId();
    return otherId ? (chat.participantNames?.[otherId] || 'Usuario') : 'Usuario';
  }

  const chatType = (chat as any)?.chatType;
  const headerEmoji = chatType === 'found_pet' ? '🐾' : '🐕';

  function markRead() {
    if (!id || !user) return;
    updateDoc(doc(db, COLLECTIONS.CHATS, id), {
      [`lastReadAt.${user.uid}`]: new Date().toISOString(),
    }).catch(() => {});
  }

  useEffect(() => {
    if (!id || !user) return;

    getDoc(doc(db, COLLECTIONS.CHATS, id)).then(async (snap) => {
      if (!snap.exists()) return;
      const chatData = { id: snap.id, ...snap.data() } as Chat;
      setChat(chatData);
      // Required by the Realtime Database rules before this user can read/write
      // messages/{id} — the store side already does this (apps/mobile/app/(store)/chat/[id].tsx),
      // it was missing here, which silently blocked owners from sending the first message.
      await Promise.all(
        chatData.participants.map((uid) => set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${id}/${uid}`), true))
      ).catch(() => {});
    }).catch(() => {});

    // Mark as read when opening the chat
    markRead();

    const msgsRef = query(ref(rtdb, `${RTDB_PATHS.MESSAGES}/${id}`), limitToLast(50));
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
        // Mark as read whenever new messages arrive while the screen is open
        markRead();
      }
    });

    return () => off(msgsRef);
  }, [id, user?.uid]);

  async function sendMessage(extraImageUrl?: string) {
    if (!text.trim() && !extraImageUrl) return;
    if (!user || !id) return;
    const otherId = getOtherId();
    if (otherId && await isBlockedByRecipient(otherId, user.uid)) {
      Alert.alert('No se pudo enviar', 'No puedes enviar mensajes a este usuario.');
      return;
    }
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
    logChatMessageSent();

    await updateDoc(doc(db, COLLECTIONS.CHATS, id), {
      lastMessage: extraImageUrl ? '📷 Foto' : msgText,
      lastMessageAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async function pickAndSendImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
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
  const otherId = getOtherId();
  const otherPhone = otherId ? chat?.participantPhones?.[otherId] : undefined;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* ── Header ── */}
      <View
        className="flex-row items-center px-4 py-3 gap-3 border-b border-gray-100"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <TouchableOpacity
          className="pr-1 py-1"
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(owner)/chat' as any))}
        >
          <Text className="text-3xl text-gray-600">←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-row items-center gap-3 flex-1"
          onPress={() => setShowProfile(true)}
          disabled={!otherId}
        >
          <View
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{ backgroundColor: '#D8F3DC' }}
          >
            <Text className="text-2xl">{headerEmoji}</Text>
          </View>
          <View className="flex-1">
            <Text className="font-bold text-gray-900 text-base leading-tight">{otherName}</Text>
            <Text className="text-gray-400 text-xs">
              {chatType === 'found_pet' ? 'Mascota encontrada' : 'Toca para ver información'}
            </Text>
          </View>
        </TouchableOpacity>
        {otherId && (
          <ReportBlockButton
            chatId={id}
            otherUserId={otherId}
            otherUserName={otherName}
            onBlocked={() => router.navigate('/(owner)/chat' as any)}
          />
        )}
      </View>

      <KeyboardAvoidingView
        // AndroidManifest.xml already sets windowSoftInputMode="adjustResize",
        // which resizes the whole window when the keyboard opens. Also
        // applying the 'height' behavior here shrinks this view a *second*
        // time on top of that, over-squeezing the layout and pushing the
        // input bar out of view — undefined lets Android's native resize do
        // the whole job.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

      <Modal visible={showProfile} transparent animationType="fade" onRequestClose={() => setShowProfile(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
          activeOpacity={1}
          onPress={() => setShowProfile(false)}
        >
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#D8F3DC' }}>
                <Text style={{ fontSize: 30 }}>{headerEmoji}</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginTop: 10 }}>{otherName}</Text>
            </View>
            {otherPhone ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${otherPhone}`)}
                style={{ backgroundColor: '#F0FDF4', borderRadius: 14, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <Text style={{ fontSize: 16 }}>📞</Text>
                <Text style={{ color: '#2D6A4F', fontWeight: '700', fontSize: 15 }}>{otherPhone}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
                No hay un teléfono de contacto disponible para este usuario.
              </Text>
            )}
            <TouchableOpacity onPress={() => setShowProfile(false)} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
