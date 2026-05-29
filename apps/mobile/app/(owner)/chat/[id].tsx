import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ref, push, onValue, off, serverTimestamp } from 'firebase/database';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, RTDB_PATHS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Chat, Message } from '@junglapp/types';

const { db, rtdb } = initFirebase();

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  function getOtherName() {
    if (!chat || !user) return 'Chat';
    const otherId = chat.participants.find((p) => p !== user.uid);
    return otherId ? (chat.participantNames[otherId] || 'Usuario') : 'Usuario';
  }

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

  async function sendMessage() {
    if (!text.trim() || !user || !id) return;
    const msgText = text.trim();
    setText('');

    const msgsRef = ref(rtdb, `${RTDB_PATHS.MESSAGES}/${id}`);
    await push(msgsRef, {
      senderId: user.uid,
      senderName: user.name,
      text: msgText,
      createdAt: new Date().toISOString(),
    });

    await updateDoc(doc(db, COLLECTIONS.CHATS, id), {
      lastMessage: msgText,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100 gap-3">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-primary-500 text-base">←</Text>
        </TouchableOpacity>
        <View className="bg-primary-100 rounded-full w-10 h-10 items-center justify-center">
          <Text className="text-xl">🐾</Text>
        </View>
        <Text className="font-semibold text-gray-800 text-base flex-1">{getOtherName()}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-4 py-2"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.uid;
            return (
              <View key={msg.id} className={`mb-3 flex-row ${isMe ? 'justify-end' : 'justify-start'}`}>
                <View className={`max-w-xs rounded-2xl px-4 py-3 ${isMe ? 'bg-primary-500 rounded-tr-sm' : 'bg-white rounded-tl-sm border border-gray-100 shadow-sm'}`}>
                  {!isMe && <Text className="text-gray-400 text-xs mb-1">{msg.senderName}</Text>}
                  <Text className={isMe ? 'text-white' : 'text-gray-800'}>{msg.text}</Text>
                  <Text className={`text-xs mt-1 ${isMe ? 'text-white/70' : 'text-gray-300'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            );
          })}
          {messages.length === 0 && (
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-4xl mb-3">🐾</Text>
              <Text className="text-gray-400 text-sm">¡Sé el primero en escribir!</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View className="flex-row items-center px-4 py-3 bg-white border-t border-gray-100 gap-2">
          <TextInput
            className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-base"
            placeholder="Escribe un mensaje..."
            value={text}
            onChangeText={setText}
            multiline
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            className={`bg-primary-500 rounded-full w-11 h-11 items-center justify-center ${!text.trim() ? 'opacity-50' : ''}`}
            onPress={sendMessage}
            disabled={!text.trim()}
          >
            <Text className="text-white text-lg">↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
