import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Pet } from '@junglapp/types';

const { db } = initFirebase();

export default function OwnerHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadPets() {
    if (!user) return;
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))
    );
    setPets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));
  }

  useEffect(() => { loadPets(); }, [user]);

  async function onRefresh() {
    setRefreshing(true);
    await loadPets();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row justify-between items-center px-6 pt-4 pb-3">
        <View>
          <Text className="text-gray-400 text-sm">Hola,</Text>
          <Text className="text-2xl font-bold text-primary-700">{user?.name?.split(' ')[0] || 'Family Lover'} 🐾</Text>
        </View>
        <TouchableOpacity
          className="bg-primary-500 rounded-full w-11 h-11 items-center justify-center"
          onPress={() => router.push('/(owner)/pets/add' as any)}
        >
          <Text className="text-white text-2xl font-light">+</Text>
        </TouchableOpacity>
      </View>

      {/* Services grid */}
      <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Servicios</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'Veterinarios', emoji: '🩺', route: '/(owner)/vets' },
            { label: 'Tiendas', emoji: '🛒', route: '/(owner)/store' },
            { label: 'Adiestradores', emoji: '🐕', route: '/(owner)/trainers' },
            { label: 'Perdidos', emoji: '🔍', route: '/(owner)/lost' },
          ].map((item) => (
            <TouchableOpacity
              key={item.route}
              onPress={() => router.push(item.route as any)}
              style={{ width: '47%', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 28, marginBottom: 4 }}>{item.emoji}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text className="px-6 text-gray-700 font-semibold text-base mb-2">Mis Mascotas</Text>

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
            {pets.map((pet) => (
              <TouchableOpacity
                key={pet.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex-row items-center gap-4"
                onPress={() => router.push(`/(owner)/pets/${pet.id}` as any)}
              >
                {pet.photos && pet.photos.length > 0 ? (
                  <Image
                    source={{ uri: pet.photos[0] }}
                    style={{ width: 64, height: 64, borderRadius: 16 }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="bg-primary-100 rounded-2xl w-16 h-16 items-center justify-center">
                    <Text className="text-3xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                  </View>
                )}
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-bold text-gray-800 text-lg">{pet.name}</Text>
                    {pet.lookingForPartner && <Text>💕</Text>}
                  </View>
                  <Text className="text-gray-500 text-sm">{pet.breed} · {pet.color}</Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    {pet.chipNumber ? `Chip: ${pet.chipNumber}` : 'Sin chip registrado'}
                  </Text>
                </View>
                <Text className="text-gray-300 text-xl">›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
