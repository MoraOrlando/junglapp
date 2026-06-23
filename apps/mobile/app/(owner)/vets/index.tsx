import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default function VetsScreen() {
  const router = useRouter();
  const [vets, setVets] = useState<Veterinarian[]>([]);
  const [filtered, setFiltered] = useState<Veterinarian[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function loadVets() {
    const now = Date.now();
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.VETERINARIANS), where('status', 'in', ['approved', 'pending']))
    );
    const data = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Veterinarian))
      .filter((v) => {
        if ((v as any).status === 'approved') return true;
        const created = (v as any).createdAt ? new Date((v as any).createdAt).getTime() : 0;
        return created > 0 && now - created < NINETY_DAYS_MS;
      });
    setVets(data);
    setFiltered(data);
  }

  useFocusEffect(useCallback(() => { loadVets().catch(() => {}); }, []));

  useEffect(() => {
    if (!search) { setFiltered(vets); return; }
    const lower = search.toLowerCase();
    setFiltered(vets.filter((v) =>
      v.name.toLowerCase().includes(lower) ||
      v.specialties.some((s) => s.toLowerCase().includes(lower))
    ));
  }, [search, vets]);

  async function onRefresh() {
    setRefreshing(true);
    await loadVets().catch(() => {});
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-2">
        <Text className="text-2xl font-bold text-primary-700 mb-4">Veterinarios 🩺</Text>
        <View className="bg-white rounded-xl flex-row items-center px-3 border border-gray-200 mb-2">
          <Text className="text-gray-400 mr-2">🔍</Text>
          <TextInput
            className="flex-1 py-3 text-base"
            placeholder="Buscar veterinario o especialidad..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1 px-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {filtered.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">🩺</Text>
            <Text className="text-gray-500">No se encontraron veterinarios</Text>
          </View>
        ) : (
          <View className="gap-4 pb-6">
            {filtered.map((vet) => (
              <TouchableOpacity
                key={vet.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
                onPress={() => router.push(`/(owner)/vets/${vet.id}` as any)}
              >
                <View className="flex-row items-center gap-4">
                  <View className="bg-blue-100 rounded-2xl w-16 h-16 items-center justify-center">
                    <Text className="text-3xl">🩺</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-gray-800 text-base">Dr. {vet.name}</Text>
                    <Text className="text-gray-500 text-sm">{vet.address}</Text>
                    {vet.specialties.length > 0 && (
                      <View className="flex-row gap-1 mt-1 flex-wrap">
                        {vet.specialties.slice(0, 3).map((s) => (
                          <View key={s} className="bg-blue-50 rounded-full px-2 py-0.5">
                            <Text className="text-blue-600 text-xs">{s}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <View className="items-end">
                    <Text className="text-primary-600 font-bold text-sm">
                      ${vet.consultationFee.toLocaleString()}
                    </Text>
                    <Text className="text-gray-400 text-xs">por consulta</Text>
                    {vet.rating && (
                      <Text className="text-amber-500 text-xs mt-1">⭐ {vet.rating.toFixed(1)}</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
