import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Place, PlaceCategory } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

const CATEGORY_META: Record<PlaceCategory, { label: string; emoji: string }> = {
  park: { label: 'Parque para perros', emoji: '🐕' },
  restaurant: { label: 'Restaurante pet-friendly', emoji: '🍽️' },
};

export default function PlacesAdminScreen() {
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | PlaceCategory>('all');

  async function loadPlaces() {
    const snap = await getDocs(collection(db, COLLECTIONS.PLACES));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Place));
    all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    setPlaces(all);
  }

  useEffect(() => { loadPlaces().finally(() => setLoading(false)); }, []);
  async function onRefresh() { setRefreshing(true); await loadPlaces(); setRefreshing(false); }

  function confirmDelete(place: Place) {
    Alert.alert('Eliminar lugar', `¿Seguro que quieres eliminar "${place.name}"? Esto es definitivo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          await deleteDoc(doc(db, COLLECTIONS.PLACES, place.id));
          setPlaces((prev) => prev.filter((p) => p.id !== place.id));
        },
      },
    ]);
  }

  const filtered = filter === 'all' ? places : places.filter((p) => p.category === filter);

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: PURPLE, marginBottom: 12 }}>🐾 Lugares ({places.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['all', 'park', 'restaurant'] as const).map((f) => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} style={{ backgroundColor: filter === f ? PURPLE : '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: filter === f ? PURPLE : '#E5E7EB' }}>
                <Text style={{ color: filter === f ? '#fff' : '#374151', fontWeight: '600', fontSize: 13 }}>
                  {f === 'all' ? 'Todos' : CATEGORY_META[f].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}>
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 34, marginBottom: 8 }}>🐾</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 14 }}>No hay lugares todavía</Text>
          </View>
        ) : filtered.map((p) => (
          <View key={p.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6', flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {p.photoUrl ? (
                <Image source={{ uri: p.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <Text style={{ fontSize: 26 }}>{CATEGORY_META[p.category].emoji}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{p.name}</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{CATEGORY_META[p.category].label}</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                {p.reviewCount > 0 ? `⭐ ${p.rating.toFixed(1)} (${p.reviewCount})` : 'Sin reseñas'} · por {p.createdByName}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => router.push(`/(owner)/near/place/${p.id}` as any)}
                  style={{ backgroundColor: '#F5F3FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
                >
                  <Text style={{ color: PURPLE, fontWeight: '700', fontSize: 12 }}>Ver / Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDelete(p)}
                  style={{ backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
                >
                  <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 12 }}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
