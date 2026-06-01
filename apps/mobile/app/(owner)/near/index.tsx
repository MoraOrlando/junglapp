import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Veterinarian, Store } from '@junglapp/types';

const { db } = initFirebase();

type Category = 'all' | 'vet' | 'store' | 'clinic' | 'grooming';

const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: 'all', label: 'Todos', emoji: '✨' },
  { id: 'vet', label: 'Veterinarios', emoji: '🩺' },
  { id: 'store', label: 'Tiendas', emoji: '🛒' },
  { id: 'clinic', label: 'Clínicas', emoji: '🏥' },
  { id: 'grooming', label: 'Peluquerías', emoji: '✂️' },
];

interface NearItem {
  id: string;
  kind: 'vet' | 'store';
  name: string;
  address: string;
  emoji: string;
  subtitle?: string;
  route: string;
}

export default function NearScreen() {
  const router = useRouter();
  const [items, setItems] = useState<NearItem[]>([]);
  const [category, setCategory] = useState<Category>('all');
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    const [vetsSnap, storesSnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTIONS.VETERINARIANS), where('status', '==', 'approved'))),
      getDocs(query(collection(db, COLLECTIONS.STORES), where('status', '==', 'approved'))),
    ]);

    const vets: NearItem[] = vetsSnap.docs.map((d) => {
      const v = { id: d.id, ...d.data() } as Veterinarian;
      return {
        id: v.id,
        kind: 'vet',
        name: `Dr. ${v.name}`,
        address: v.address,
        emoji: '🩺',
        subtitle: v.consultationFee ? `$${v.consultationFee.toLocaleString()} consulta` : undefined,
        route: `/(owner)/vets/${v.id}`,
      };
    });

    const stores: NearItem[] = storesSnap.docs.map((d) => {
      const s = { id: d.id, ...d.data() } as Store;
      return {
        id: s.id,
        kind: 'store',
        name: s.name,
        address: s.address,
        emoji: '🛒',
        subtitle: 'Tienda de mascotas',
        route: `/(owner)/store`,
      };
    });

    setItems([...vets, ...stores]);
  }

  useEffect(() => { loadData(); }, []);

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  const filtered = items.filter((it) => {
    if (category === 'all') return true;
    if (category === 'vet' || category === 'clinic') return it.kind === 'vet';
    if (category === 'store' || category === 'grooming') return it.kind === 'store';
    return true;
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-2">
        <Text className="text-2xl font-bold text-primary-700">Cerca de ti 📍</Text>
        <Text className="text-gray-400 text-sm mt-1">Servicios y tiendas disponibles</Text>
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-6 mb-2" contentContainerStyle={{ gap: 8, paddingRight: 24 }}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.id}
            className={`rounded-full px-4 py-2 border ${category === c.id ? 'bg-primary-500 border-primary-500' : 'bg-white border-gray-200'}`}
            onPress={() => setCategory(c.id)}
          >
            <Text className={`text-sm font-medium ${category === c.id ? 'text-white' : 'text-gray-600'}`}>
              {c.emoji} {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        className="flex-1 px-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {filtered.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">📍</Text>
            <Text className="text-gray-500">No hay servicios disponibles aún</Text>
          </View>
        ) : (
          <View className="gap-4 pb-6 pt-2">
            {filtered.map((it) => (
              <TouchableOpacity
                key={`${it.kind}-${it.id}`}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex-row items-center gap-4"
                onPress={() => router.push(it.route as any)}
              >
                <View className={`rounded-2xl w-16 h-16 items-center justify-center ${it.kind === 'vet' ? 'bg-blue-100' : 'bg-amber-100'}`}>
                  <Text className="text-3xl">{it.emoji}</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-gray-800 text-base">{it.name}</Text>
                  <Text className="text-gray-500 text-sm">{it.address}</Text>
                  {it.subtitle && <Text className="text-primary-600 text-xs mt-0.5">{it.subtitle}</Text>}
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
