import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, getDocs, where, query } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Trainer } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#2D6A4F';
const INDIGO = '#4F46E5';

export default function TrainersScreen() {
  const router = useRouter();
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [filtered, setFiltered] = useState<Trainer[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadTrainers() {
    const snap = await getDocs(query(collection(db, COLLECTIONS.TRAINERS), where('status', '==', 'approved')));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Trainer));
    setTrainers(all);
    setFiltered(all);
  }

  useEffect(() => { loadTrainers().finally(() => setLoading(false)); }, []);

  useEffect(() => {
    if (!search) { setFiltered(trainers); return; }
    const lower = search.toLowerCase();
    setFiltered(trainers.filter((t) =>
      t.name.toLowerCase().includes(lower) ||
      t.specialties?.some((s) => s.toLowerCase().includes(lower)) ||
      t.serviceArea?.toLowerCase().includes(lower)
    ));
  }, [search, trainers]);

  async function onRefresh() { setRefreshing(true); await loadTrainers(); setRefreshing(false); }

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={INDIGO} />
      <Text style={{ color: '#9CA3AF', marginTop: 12 }}>Buscando adiestradores...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
          <Text style={{ color: GREEN, fontSize: 16 }}>← Volver</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: INDIGO, marginBottom: 12 }}>Adiestradores 🐕</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
          <Text style={{ color: '#9CA3AF', marginRight: 8 }}>🔍</Text>
          <TextInput
            style={{ flex: 1, paddingVertical: 12, fontSize: 15 }}
            placeholder="Buscar por nombre, especialidad o zona..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INDIGO} />}>
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 64 }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🐕</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 14 }}>{trainers.length === 0 ? 'No hay adiestradores disponibles' : 'Sin resultados'}</Text>
          </View>
        ) : (
          <View style={{ gap: 14, paddingBottom: 40, paddingTop: 8 }}>
            {filtered.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => router.push(`/(owner)/trainers/${t.id}` as any)}
                style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' }}
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                  {t.photoUrl ? (
                    <Image source={{ uri: t.photoUrl }} style={{ width: 64, height: 64, borderRadius: 32 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 28 }}>🐕</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 16, color: '#1F2937' }}>{t.name}</Text>
                    {(t.rating ?? 0) > 0 && (
                      <Text style={{ color: '#6B7280', fontSize: 13 }}>⭐ {t.rating?.toFixed(1)} · {t.reviewCount} reseñas</Text>
                    )}
                    {t.serviceArea && (
                      <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>📍 {t.serviceArea}</Text>
                    )}
                  </View>
                  {t.consultationFee > 0 && (
                    <View style={{ backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: '#059669', fontWeight: '700', fontSize: 13 }}>${t.consultationFee.toLocaleString()}</Text>
                    </View>
                  )}
                </View>
                {t.specialties?.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    {t.specialties.slice(0, 4).map((s) => (
                      <View key={s} style={{ backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: INDIGO, fontSize: 11, fontWeight: '600' }}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
