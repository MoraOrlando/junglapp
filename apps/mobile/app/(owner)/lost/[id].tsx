import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  doc, getDoc, updateDoc, addDoc, collection, query, where, getDocs
} from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { initFirebase, COLLECTIONS, RTDB_PATHS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { LostPet } from '@junglapp/types';

const { db, rtdb } = initFirebase();

export default function LostPetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [lostPet, setLostPet] = useState<LostPet | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.LOST_PETS, id)).then((snap) => {
      if (snap.exists()) setLostPet({ id: snap.id, ...snap.data() } as LostPet);
    }).catch(() => {});
  }, [id]);

  const isOwner = lostPet?.ownerId === user?.uid;

  async function handleFound() {
    if (!lostPet || !user || isOwner) return;

    Alert.alert(
      '🐾 ¿Encontraste a esta mascota?',
      `Al confirmar, se notificará al dueño de ${(lostPet as any).petName} y se abrirá un chat privado entre ustedes para coordinar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: '¡Sí, la encontré!',
          onPress: async () => {
            setMarking(true);
            try {
              // Check if chat already exists for this lost pet
              const existingChat = await getDocs(query(
                collection(db, COLLECTIONS.CHATS),
                where('lostPetId', '==', id),
                where('participants', 'array-contains', user.uid)
              ));

              let chatId: string;

              if (!existingChat.empty) {
                chatId = existingChat.docs[0].id;
              } else {
                // Get owner info
                const ownerDoc = await getDoc(doc(db, COLLECTIONS.USERS, lostPet.ownerId));
                const ownerData = ownerDoc.data();

                // Mark lost pet as found
                await updateDoc(doc(db, COLLECTIONS.LOST_PETS, id!), {
                  isFound: true,
                  foundBy: user.uid,
                  foundAt: new Date().toISOString(),
                });

                // Create found-pet chat
                const chatRef = await addDoc(collection(db, COLLECTIONS.CHATS), {
                  participants: [user.uid, lostPet.ownerId],
                  participantNames: {
                    [user.uid]: user.name,
                    [lostPet.ownerId]: ownerData?.name || 'Dueño',
                  },
                  lostPetId: id,
                  chatType: 'found_pet',
                  lastMessage: `¡Encontré a ${(lostPet as any).petName}! 🐾`,
                  lastMessageAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
                chatId = chatRef.id;

                // Register both participants in RTDB so chat messages are accessible
                await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatId}/${user.uid}`), true);
                await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatId}/${lostPet.ownerId}`), true);
              }

              router.replace(`/(owner)/chat/${chatId}` as any);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setMarking(false);
            }
          },
        },
      ]
    );
  }

  function handleMarkFoundByOwner() {
    if (!lostPet || !isOwner) return;
    Alert.alert(
      '🎉 ¡Qué bueno!',
      `¿Confirmas que ${(lostPet as any).petName} apareció? Se quitará la publicación de la lista de mascotas perdidas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, apareció',
          onPress: async () => {
            setMarking(true);
            try {
              await updateDoc(doc(db, COLLECTIONS.LOST_PETS, id!), {
                isFound: true,
                foundAt: new Date().toISOString(),
              });
              setLostPet((prev) => prev ? { ...prev, isFound: true } : prev);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setMarking(false);
            }
          },
        },
      ]
    );
  }

  if (!lostPet) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando...</Text>
    </SafeAreaView>
  );

  const lp = lostPet as any; // extended fields saved in doc

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1">
        {/* Hero */}
        <View className="bg-red-400 h-52 items-center justify-center relative">
          <Text className="text-9xl">{lp.petSpecies === 'cat' ? '🐈' : '🐕'}</Text>
          <View className="absolute bottom-4 bg-red-600/80 px-4 py-1.5 rounded-full">
            <Text className="text-white text-xs font-bold">🔍 EXTRAVIADA</Text>
          </View>
        </View>

        <TouchableOpacity
          className="absolute top-10 left-4 bg-white/80 rounded-full p-2"
          onPress={() => router.back()}
        >
          <Text className="text-red-700 text-base px-1">←</Text>
        </TouchableOpacity>

        <View className="px-6 -mt-6 pb-10">
          {/* Name card */}
          <View className="bg-white rounded-2xl p-5 shadow-md mb-4">
            <View className="flex-row justify-between items-start">
              <View>
                <Text className="text-3xl font-bold text-gray-800">{lp.petName}</Text>
                <Text className="text-gray-500 mt-1">{lp.petBreed} · {lp.petColor}</Text>
              </View>
              <View className="items-end">
                <Text className="text-gray-400 text-xs">Reportada</Text>
                <Text className="text-gray-600 text-xs font-medium">
                  {new Date(lostPet.reportedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
            </View>
            {lp.chipNumber && (
              <View className="mt-2 bg-gray-50 rounded-xl px-3 py-2">
                <Text className="text-gray-500 text-xs">🔖 Chip: <Text className="font-mono font-semibold">{lp.chipNumber}</Text></Text>
              </View>
            )}
          </View>

          {/* Location info */}
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
            <Text className="font-semibold text-gray-700 mb-3">📍 Ubicación</Text>
            <View className="gap-2">
              <View className="flex-row gap-2">
                <Text className="text-gray-400 text-sm w-28">Región:</Text>
                <Text className="text-gray-700 text-sm font-medium flex-1">{lostPet.region}</Text>
              </View>
              {lostPet.state && (
                <View className="flex-row gap-2">
                  <Text className="text-gray-400 text-sm w-28">Ciudad:</Text>
                  <Text className="text-gray-700 text-sm flex-1">{lostPet.state}</Text>
                </View>
              )}
              <View className="flex-row gap-2">
                <Text className="text-gray-400 text-sm w-28">Último lugar:</Text>
                <Text className="text-gray-700 text-sm flex-1">{lostPet.lastSeenLocation}</Text>
              </View>
              <View className="flex-row gap-2">
                <Text className="text-gray-400 text-sm w-28">Fecha extravío:</Text>
                <Text className="text-gray-700 text-sm flex-1">{lostPet.lastSeenDate}</Text>
              </View>
            </View>
          </View>

          {/* Characteristics */}
          {lp.characteristics && (
            <View className="bg-amber-50 rounded-2xl p-4 mb-4 border border-amber-200">
              <Text className="font-semibold text-amber-700 mb-1">🔎 Características al momento del extravío</Text>
              <Text className="text-amber-700 text-sm leading-relaxed">{lp.characteristics}</Text>
            </View>
          )}

          {/* Description */}
          {lostPet.description && (
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs mb-1">Descripción</Text>
              <Text className="text-gray-700 text-sm leading-relaxed">{lostPet.description}</Text>
            </View>
          )}

          {/* Contact */}
          <View className="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-gray-100">
            <Text className="font-semibold text-gray-700 mb-2">📞 Contacto del dueño</Text>
            <TouchableOpacity
              className="flex-row items-center gap-2"
              onPress={() => Linking.openURL(`tel:${lostPet.contactPhone}`)}
            >
              <Text className="text-primary-600 font-semibold">{lostPet.contactPhone}</Text>
              <Text className="text-gray-400 text-xs">(toca para llamar)</Text>
            </TouchableOpacity>
            <Text className="text-gray-500 text-sm mt-1">{lostPet.contactEmail}</Text>
          </View>

          {/* Action buttons */}
          {!isOwner ? (
            <View className="gap-3">
              <TouchableOpacity
                className={`bg-primary-500 rounded-2xl py-4 items-center ${marking ? 'opacity-70' : ''}`}
                onPress={handleFound}
                disabled={marking}
              >
                <Text className="text-white font-bold text-base">
                  {marking ? 'Abriendo chat...' : '🐾 ¡La encontré! — Notificar al dueño'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-blue-50 border border-blue-200 rounded-2xl py-3 items-center"
                onPress={() => Linking.openURL(`tel:${lostPet.contactPhone}`)}
              >
                <Text className="text-blue-600 font-semibold">📞 Llamar al dueño directamente</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="gap-3">
              <View className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <Text className="text-orange-700 font-semibold text-center">Esta es tu publicación</Text>
                <Text className="text-orange-500 text-xs text-center mt-1">
                  Cuando alguien encuentre a {lp.petName}, recibirás un mensaje en el chat
                </Text>
              </View>
              <TouchableOpacity
                className={`bg-primary-500 rounded-2xl py-4 items-center ${marking ? 'opacity-70' : ''}`}
                onPress={handleMarkFoundByOwner}
                disabled={marking}
              >
                <Text className="text-white font-bold text-base">
                  {marking ? 'Guardando...' : `🎉 ${lp.petName} apareció — Marcar como encontrada`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
