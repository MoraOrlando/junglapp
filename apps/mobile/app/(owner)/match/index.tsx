import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, onSnapshot, limit
} from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { initFirebase, COLLECTIONS, RTDB_PATHS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Pet } from '@junglapp/types';

const { width } = Dimensions.get('window');
const { db, rtdb } = initFirebase();

export default function MatchScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [candidates, setCandidates] = useState<Pet[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedMyPet, setSelectedMyPet] = useState<Pet | null>(null);
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    loadMyPets();
    const q = query(collection(db, COLLECTIONS.CHATS), where('participants', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => setMatchCount(snap.docs.filter((d) => !!d.data().matchId).length));
    return unsub;
  }, [user?.uid]);

  async function loadMyPets() {
    if (!user) return;
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))
    );
    const pets = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet));
    setMyPets(pets);
  }

  async function loadCandidates(myPet: Pet) {
    if (!user) return;
    setSelectedMyPet(myPet);
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.PETS), where('lookingForPartner', '==', true))
    );
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet));
    setCandidates(all.filter((p) => p.ownerId !== user.uid));
    setCurrentIndex(0);
  }

  async function handleMatch(liked: boolean) {
    if (!selectedMyPet || candidates.length === 0) return;
    const candidate = candidates[currentIndex];
    if (liked && user) {
      // Guard against duplicate matches
      const existing = await getDocs(
        query(collection(db, COLLECTIONS.MATCHES),
          where('pet1Id', '==', selectedMyPet.id),
          where('pet2Id', '==', candidate.id),
          limit(1))
      );
      if (!existing.empty) {
        setCurrentIndex((i) => i + 1);
        return;
      }

      // Get candidate owner name
      const ownerDoc = await getDoc(doc(db, COLLECTIONS.USERS, candidate.ownerId));
      const ownerData = ownerDoc.exists() ? ownerDoc.data() : null;

      // Create match
      const matchRef = await addDoc(collection(db, COLLECTIONS.MATCHES), {
        pet1Id: selectedMyPet.id,
        pet2Id: candidate.id,
        owner1Id: user.uid,
        owner2Id: candidate.ownerId,
        status: 'matched',
        createdAt: new Date().toISOString(),
      });

      // Create chat
      const chatRef = await addDoc(collection(db, COLLECTIONS.CHATS), {
        participants: [user.uid, candidate.ownerId],
        participantNames: {
          [user.uid]: user.name,
          [candidate.ownerId]: ownerData?.name || 'Usuario',
        },
        matchId: matchRef.id,
        lastMessage: `¡${selectedMyPet.name} y ${candidate.name} hicieron match! 🐾`,
        updatedAt: new Date().toISOString(),
      });

      // Register both participants in RTDB so chat messages are accessible
      await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatRef.id}/${user.uid}`), true);
      await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatRef.id}/${candidate.ownerId}`), true);

      Alert.alert('¡Match! 💚', `${selectedMyPet.name} y ${candidate.name} han hecho match. ¡Puedes chatear con el dueño!`);
    }
    setCurrentIndex((i) => i + 1);
  }

  const petsLookingForPartner = myPets.filter((p) => p.lookingForPartner);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text className="text-2xl font-bold text-primary-700">Match 💚</Text>
            <Text className="text-gray-500 text-sm mt-1">Encuentra pareja para tu mascota</Text>
          </View>
          {matchCount > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/(owner)/chat' as any)}
              style={{ backgroundColor: '#dcfce7', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 20 }}>💚</Text>
              <Text style={{ color: '#15803d', fontWeight: '700', fontSize: 16 }}>{matchCount}</Text>
              <Text style={{ color: '#16a34a', fontSize: 10 }}>matches</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {petsLookingForPartner.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-6xl mb-4">💕</Text>
          <Text className="text-gray-700 text-lg font-semibold text-center">
            Ninguna mascota en modo Match
          </Text>
          <Text className="text-gray-400 text-sm mt-2 text-center">
            Ve al perfil de tu mascota y activa "Busca Pareja" para participar en el Match
          </Text>
        </View>
      ) : !selectedMyPet ? (
        <ScrollView className="flex-1 px-6 mt-6">
          <Text className="text-gray-600 font-medium mb-4">Selecciona qué mascota quieres mostrar:</Text>
          <View className="gap-3">
            {petsLookingForPartner.map((pet) => (
              <TouchableOpacity
                key={pet.id}
                className="bg-white rounded-2xl p-4 flex-row items-center gap-4 shadow-sm border border-gray-100"
                onPress={() => loadCandidates(pet)}
              >
                <View className="bg-pink-100 rounded-2xl w-14 h-14 items-center justify-center">
                  <Text className="text-3xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-gray-800">{pet.name}</Text>
                  <Text className="text-gray-500 text-sm">{pet.breed}</Text>
                </View>
                <Text className="text-pink-500">💕 Match →</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : currentIndex >= candidates.length ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-5xl mb-4">🎉</Text>
          <Text className="text-gray-700 text-lg font-semibold">¡Has visto todos!</Text>
          <Text className="text-gray-400 text-sm mt-2 text-center">
            No hay más candidatos por ahora. Vuelve más tarde.
          </Text>
          <TouchableOpacity
            className="mt-6 bg-primary-500 rounded-2xl px-6 py-3"
            onPress={() => { setSelectedMyPet(null); setCandidates([]); }}
          >
            <Text className="text-white font-semibold">Cambiar mascota</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="flex-1 px-6 mt-6">
          {/* Current candidate card */}
          <View className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden mb-6">
            <View className="bg-gradient-to-b from-primary-300 to-primary-500 h-56 items-center justify-center">
              <Text className="text-9xl">
                {candidates[currentIndex].species === 'cat' ? '🐈' : '🐕'}
              </Text>
            </View>
            <View className="p-5">
              <View className="flex-row justify-between items-start">
                <View>
                  <Text className="text-2xl font-bold text-gray-800">{candidates[currentIndex].name}</Text>
                  <Text className="text-gray-500">{candidates[currentIndex].breed}</Text>
                  <Text className="text-gray-400 text-sm">{candidates[currentIndex].color}</Text>
                </View>
                <Text className="text-gray-400 text-sm">
                  {currentIndex + 1} / {candidates.length}
                </Text>
              </View>
              {candidates[currentIndex].description && (
                <Text className="text-gray-600 text-sm mt-3 leading-relaxed">
                  {candidates[currentIndex].description}
                </Text>
              )}
            </View>
          </View>

          {/* Action buttons */}
          <View className="flex-row justify-center gap-8">
            <TouchableOpacity
              className="bg-white rounded-full w-20 h-20 items-center justify-center shadow-lg border border-red-100"
              onPress={() => handleMatch(false)}
            >
              <Text className="text-4xl">✕</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-primary-500 rounded-full w-20 h-20 items-center justify-center shadow-lg"
              onPress={() => handleMatch(true)}
            >
              <Text className="text-4xl">💚</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className="mt-6 items-center"
            onPress={() => { setSelectedMyPet(null); setCandidates([]); }}
          >
            <Text className="text-gray-400 text-sm">← Cambiar mascota</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
