import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase } from '@junglapp/firebase';
import { COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Pet } from '@junglapp/types';

const { db } = initFirebase();

export default function PetsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadPets() {
    if (!user) return;
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet));
      // Deceased pets sink to the end of the list, greyed out below.
      list.sort((a, b) => Number(!!a.deceasedAt) - Number(!!b.deceasedAt));
      setPets(list);
    } catch {}
  }

  useEffect(() => { loadPets().catch(() => {}); }, [user]);

  async function onRefresh() {
    setRefreshing(true);
    await loadPets();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row justify-between items-center px-6 py-4">
        <Text className="text-2xl font-bold text-primary-700">Mis Mascotas 🐾</Text>
        <TouchableOpacity
          className="bg-primary-500 rounded-full w-10 h-10 items-center justify-center"
          onPress={() => router.push('/(owner)/pets/add' as any)}
        >
          <Text className="text-white text-2xl font-light">+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 px-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {pets.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-6xl mb-4">🐾</Text>
            <Text className="text-gray-600 text-lg font-medium">¡Aún no tienes mascotas!</Text>
            <Text className="text-gray-400 text-sm mt-2 text-center">
              Agrega tu primera mascota y comienza a disfrutar JunglApp
            </Text>
            <TouchableOpacity
              className="bg-primary-500 rounded-2xl px-6 py-3 mt-6"
              onPress={() => router.push('/(owner)/pets/add' as any)}
            >
              <Text className="text-white font-semibold">Agregar Mascota</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-4 pb-6">
            {pets.map((pet) => {
              const deceased = !!pet.deceasedAt;
              return (
                <TouchableOpacity
                  key={pet.id}
                  className={`rounded-2xl p-4 shadow-sm border flex-row items-center gap-4 ${deceased ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-100'}`}
                  style={deceased ? { opacity: 0.6 } : undefined}
                  onPress={() => router.push(`/(owner)/pets/${pet.id}` as any)}
                >
                  {pet.photos && pet.photos.length > 0 ? (
                    <Image
                      source={{ uri: pet.photos[0] }}
                      style={{ width: 64, height: 64, borderRadius: 16 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className={`rounded-2xl w-16 h-16 items-center justify-center ${deceased ? 'bg-gray-200' : 'bg-primary-100'}`}>
                      <Text className="text-3xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className={`font-bold text-lg ${deceased ? 'text-gray-500' : 'text-gray-800'}`}>{pet.name}</Text>
                      {pet.lookingForPartner && !deceased && <Text>💕</Text>}
                      {deceased && <Text className="text-gray-400 text-xs">🕊️ En memoria</Text>}
                    </View>
                    <Text className="text-gray-500 text-sm">{pet.breed} · {pet.color}</Text>
                    <Text className="text-gray-400 text-xs mt-0.5">
                      {pet.chipNumber ? `Chip: ${pet.chipNumber}` : 'Sin chip registrado'}
                    </Text>
                  </View>
                  <Text className="text-gray-300 text-xl">›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
