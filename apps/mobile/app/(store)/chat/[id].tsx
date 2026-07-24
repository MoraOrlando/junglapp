import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ref, set, push, onValue, off, query, limitToLast } from 'firebase/database';
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
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'HOY';
  return d.toLocaleDateString('es-CL', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
}

function groupByDate(msgs: Message[]) {
  const groups: Record<string, Message[]> = {};
  for (const msg of msgs) {
    const label = formatDateLabel(msg.createdAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(msg);
  }
  return Object.entries(groups).map(([label, messages]) => ({ label, messages }));
}

export default function StoreChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function getOtherId(): string | null {
    if (!chat || !user) return null;
    return chat.participants.find((p) => p !== user.uid) ?? null;
  }

  function getOtherName(): string {
    if (!chat || !user) return 'Cliente';
    const otherId = getOtherId();
    return otherId ? (chat.participantNames?.[otherId] || 'Cliente') : 'Cliente';
  }

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
      await Promise.all(
        chatData.participants.map((uid) => set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${id}/${uid}`), true))
      ).catch(() => {});
    }).catch(() => {});

    markRead();

    const msgsRef = query(ref(rtdb, `${RTDB_PATHS.MESSAGES}/${id}`), limitToLast(50));
    onValue(msgsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgs = Object.entries(data).map(([msgId, msg]: [string, any]) => ({
          id: msgId, chatId: id, ...msg,
        })) as Message[];
        msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(msgs);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
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

    await push(ref(rtdb, `${RTDB_PATHS.MESSAGES}/${id}`), {
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
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const url = await uploadImage(result.assets[0].uri);
      await sendMessage(url);
    } catch {
      Alert.alert('Error', 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
    }
  }

  const groups = groupByDate(messages);
  const AMBER = '#D97706';
  const otherName = getOtherName();
  const otherId = getOtherId();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' }}>
        <TouchableOpacity onPress={() => router.navigate('/(store)/chat' as any)}>
          <Text style={{ fontSize: 24, color: '#6B7280' }}>←</Text>
        </TouchableOpacity>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>🛍️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: '#111827', fontSize: 15 }}>{otherName}</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Pedido</Text>
        </View>
        {otherId && (
          <ReportBlockButton
            chatId={id}
            otherUserId={otherId}
            otherUserName={otherName}
            onBlocked={() => router.back()}
          />
        )}
      </View>

      {/* AndroidManifest.xml already sets windowSoftInputMode="adjustResize" —
          applying 'height' here too double-shrinks the layout on Android and
          pushes the input bar out of view; undefined lets the native resize
          do the whole job. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 80 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>Coordina la entrega o retiro aquí</Text>
            </View>
          )}

          {groups.map(({ label, messages: groupMsgs }) => (
            <View key={label}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
                <Text style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>{label}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
              </View>

              {groupMsgs.map((msg) => {
                const isMe = msg.senderId === user?.uid;
                return (
                  <View key={msg.id} style={{ marginBottom: 16, flexDirection: 'row', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    <View style={{ maxWidth: '75%', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      {msg.imageUrl ? (
                        <Image source={{ uri: msg.imageUrl }} style={{ width: 200, height: 150, borderRadius: 16, marginBottom: 4 }} resizeMode="cover" />
                      ) : null}
                      {msg.text ? (
                        <View style={{
                          borderRadius: 18,
                          borderTopRightRadius: isMe ? 4 : 18,
                          borderTopLeftRadius: isMe ? 18 : 4,
                          paddingHorizontal: 16, paddingVertical: 10,
                          backgroundColor: isMe ? AMBER : '#fff',
                          borderWidth: isMe ? 0 : 1,
                          borderColor: '#E5E7EB',
                        }}>
                          <Text style={{ color: isMe ? '#fff' : '#111827', fontSize: 15 }}>{msg.text}</Text>
                        </View>
                      ) : null}
                      <Text style={{ color: '#D1D5DB', fontSize: 11, marginTop: 4, paddingHorizontal: 4 }}>
                        {formatTime(msg.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', gap: 8 }}>
          <TouchableOpacity
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
            onPress={pickAndSendImage}
            disabled={uploading}
          >
            <Text style={{ fontSize: 18 }}>{uploading ? '⏳' : '📷'}</Text>
          </TouchableOpacity>

          <TextInput
            style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#111827' }}
            placeholder="Escribe un mensaje..."
            placeholderTextColor="#9CA3AF"
            value={text}
            onChangeText={setText}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
          />

          <TouchableOpacity
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: text.trim() ? AMBER : '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => sendMessage()}
            disabled={!text.trim()}
          >
            <Text style={{ fontSize: 16 }}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
