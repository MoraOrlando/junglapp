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
  rating?: number;
  reviewCount?: number;
  consultationFee?: number;
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
        subtitle: v.consultationFee ? `$${v.consultationFee.toLocaleString('es-CL')} consulta` : undefined,
        route: `/(owner)/vets/${v.id}`,
        rating: v.rating,
        reviewCount: v.reviewCount,
        consultationFee: v.consultationFee,
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: '#1D4ED8' }}>Cerca de ti 📍</Text>
        <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 4 }}>Servicios y tiendas disponibles</Text>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 50, marginBottom: 8 }}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8, alignItems: 'center' }}
      >
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.id}
            onPress={() => setCategory(c.id)}
            style={{
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: category === c.id ? '#1D4ED8' : '#E2E8F0',
              backgroundColor: category === c.id ? '#1D4ED8' : '#FFFFFF',
            }}
          >
            <Text style={{
              fontSize: 13,
              fontWeight: '600',
              color: category === c.id ? '#FFFFFF' : '#64748B',
            }}>
              {c.emoji} {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1D4ED8" />}
      >
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📍</Text>
            <Text style={{ color: '#94A3B8', fontSize: 15 }}>No hay servicios disponibles aún</Text>
          </View>
        ) : (
          <View style={{ gap: 12, paddingBottom: 24, paddingTop: 8 }}>
            {filtered.map((it) => (
              <TouchableOpacity
                key={`${it.kind}-${it.id}`}
                onPress={() => router.push(it.route as any)}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 20,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  elevation: 2,
                  borderWidth: 1,
                  borderColor: '#F1F5F9',
                }}
              >
                {/* Icon */}
                <View style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  backgroundColor: it.kind === 'vet' ? '#EFF6FF' : '#FEF3C7',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 30 }}>{it.emoji}</Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, marginBottom: 2 }}>
                    {it.name}
                  </Text>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 4 }}>{it.address}</Text>

                  {/* Rating + fee row (for vets) */}
                  {it.kind === 'vet' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {/* Rating */}
                      <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>
                        ⭐ {it.rating ? it.rating.toFixed(1) : 'Sin reseñas'}
                        {it.reviewCount ? ` (${it.reviewCount})` : ''}
                      </Text>
                      {/* Fee */}
                      {it.consultationFee !== undefined && it.consultationFee > 0 && (
                        <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '600' }}>
                          💰 ${it.consultationFee.toLocaleString('es-CL')}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Subtitle for stores */}
                  {it.kind === 'store' && it.subtitle && (
                    <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '500' }}>{it.subtitle}</Text>
                  )}
                </View>

                <Text style={{ color: '#CBD5E1', fontSize: 20 }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
