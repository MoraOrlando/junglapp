import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { LostPet } from '@junglapp/types';

const { db } = initFirebase();

const REGIONS = [
  'Todas', 'Metropolitana', 'Valparaíso', 'Biobío', 'Araucanía',
  'Los Lagos', 'Maule', 'O\'Higgins', 'Coquimbo', 'Antofagasta',
];

export default function LostPetsPublicScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [lostPets, setLostPets] = useState<LostPet[]>([]);
  const [filtered, setFiltered] = useState<LostPet[]>([]);
  const [regionFilter, setRegionFilter] = useState('Todas');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.LOST_PETS), where('isFound', '==', false))
    );
    const data = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as LostPet))
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
    setLostPets(data);
    setFiltered(data);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let result = lostPets;
    if (regionFilter !== 'Todas') {
      result = result.filter((lp) => lp.region === regionFilter);
    }
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter((lp) =>
        (lp as any).petName?.toLowerCase().includes(lower) ||
        lp.lastSeenLocation?.toLowerCase().includes(lower) ||
        lp.state?.toLowerCase().includes(lower)
      );
    }
    setFiltered(result);
  }, [regionFilter, search, lostPets]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const myReports = lostPets.filter((lp) => lp.ownerId === user?.uid);

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-red-500 px-6 pb-6 pt-4 rounded-b-3xl">
        <Text className="text-white text-2xl font-bold">🔍 Mascotas Extraviadas</Text>
        <Text className="text-white/70 text-sm mt-1">{filtered.length} publicaciones activas</Text>

        <View className="flex-row items-center bg-white/20 rounded-xl px-3 mt-4">
          <Text className="text-white/70 mr-2">🔍</Text>
          <TextInput
            className="flex-1 py-3 text-white"
            placeholder="Buscar por nombre, lugar..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* My reports banner */}
      {myReports.length > 0 && (
        <View className="mx-6 mt-4 bg-orange-50 border border-orange-200 rounded-2xl p-3 flex-row items-center gap-2">
          <Text className="text-xl">🚨</Text>
          <View className="flex-1">
            <Text className="text-orange-700 font-semibold text-sm">
              Tienes {myReports.length} mascota{myReports.length > 1 ? 's' : ''} reportada{myReports.length > 1 ? 's' : ''}
            </Text>
            <Text className="text-orange-500 text-xs">Recibirás un chat cuando alguien las encuentre</Text>
          </View>
        </View>
      )}

      {/* Region filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 px-6" style={{ maxHeight: 44 }}>
        {REGIONS.map((r) => (
          <TouchableOpacity
            key={r}
            className={`mr-2 rounded-full px-4 py-1.5 ${regionFilter === r ? 'bg-red-500' : 'bg-white border border-gray-200'}`}
            onPress={() => setRegionFilter(r)}
          >
            <Text className={`text-sm font-medium ${regionFilter === r ? 'text-white' : 'text-gray-600'}`}>{r}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        className="flex-1 px-6 mt-3"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EF4444" />}
      >
        {filtered.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-5xl mb-3">🎉</Text>
            <Text className="text-gray-600 font-medium">No hay mascotas extraviadas en esta zona</Text>
            <Text className="text-gray-400 text-sm mt-1 text-center">¡Qué buena noticia! Si ves una mascota perdida, ayúdanos a reportarla.</Text>
          </View>
        ) : (
          <View className="gap-4 pb-6">
            {filtered.map((lp) => {
              const isOwner = lp.ownerId === user?.uid;
              return (
                <TouchableOpacity
                  key={lp.id}
                  className={`rounded-2xl overflow-hidden shadow-sm border ${isOwner ? 'border-orange-200' : 'border-gray-100'}`}
                  onPress={() => router.push(`/(owner)/lost/${lp.id}` as any)}
                >
                  {/* Photo area */}
                  <View className="bg-red-100 h-32 items-center justify-center relative">
                    <Text className="text-7xl">{(lp as any).petSpecies === 'cat' ? '🐈' : '🐕'}</Text>
                    {isOwner && (
                      <View className="absolute top-2 right-2 bg-orange-500 rounded-full px-2 py-0.5">
                        <Text className="text-white text-xs font-bold">Mi mascota</Text>
                      </View>
                    )}
                  </View>

                  <View className="bg-white p-4">
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1">
                        <Text className="font-bold text-gray-800 text-lg">{(lp as any).petName || 'Sin nombre'}</Text>
                        <Text className="text-gray-500 text-sm">{(lp as any).petBreed} · {(lp as any).petColor}</Text>
                      </View>
                      <View className="bg-red-100 rounded-xl px-2 py-1">
                        <Text className="text-red-600 text-xs font-medium">🔍 Extraviada</Text>
                      </View>
                    </View>

                    <View className="mt-2 gap-1">
                      <Text className="text-gray-500 text-sm">📍 {lp.lastSeenLocation}</Text>
                      <Text className="text-gray-500 text-sm">🗺️ {lp.region}{lp.state ? ` · ${lp.state}` : ''}</Text>
                      <Text className="text-gray-400 text-xs">📅 Visto por última vez: {lp.lastSeenDate}</Text>
                    </View>

                    {lp.description && (
                      <Text className="text-gray-500 text-sm mt-2" numberOfLines={2}>{lp.description}</Text>
                    )}

                    {!isOwner && (
                      <View className="mt-3 bg-primary-50 rounded-xl px-4 py-2.5 items-center">
                        <Text className="text-primary-600 font-semibold text-sm">¿La encontraste? Toca aquí →</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
