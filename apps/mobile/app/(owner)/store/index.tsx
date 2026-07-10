import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, getDocs, where, query } from 'firebase/firestore';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Store } from '@junglapp/types';
import { distanceKm } from '../../../lib/distance';

const { db } = initFirebase();
const GREEN = '#2D6A4F';

interface StoreWithDistance extends Store {
  distanceKm?: number;
}

const CATEGORIES = ['Todas', 'Alimentos', 'Juguetes', 'Accesorios', 'Higiene', 'Salud', 'Servicios'];

export default function StoreScreen() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreWithDistance[]>([]);
  const [filtered, setFiltered] = useState<StoreWithDistance[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  async function loadStores(location?: { lat: number; lng: number } | null) {
    const snap = await getDocs(query(collection(db, COLLECTIONS.STORES), where('status', '==', 'approved')));
    const all = snap.docs.map((d) => {
      const s = { id: d.id, ...d.data() } as StoreWithDistance;
      if (location && s.location) {
        s.distanceKm = distanceKm(location.lat, location.lng, s.location.lat, s.location.lng);
      }
      return s;
    });
    // Sort: with distance first (nearest), then alphabetical
    all.sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return a.name.localeCompare(b.name);
    });
    setStores(all);
    setFiltered(all);
  }

  async function init() {
    setLoading(true);
    let loc: { lat: number; lng: number } | null = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
      }
    } catch { /* sin ubicación — ordenar alfabético */ }
    await loadStores(loc);
    setLoading(false);
  }

  useEffect(() => { init(); }, []);

  useEffect(() => {
    let result = stores;
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter((s) => s.name.toLowerCase().includes(lower) || s.description?.toLowerCase().includes(lower));
    }
    if (selectedCategory !== 'Todas') {
      if (selectedCategory === 'Servicios') {
        result = result.filter((s) => s.services && s.services.length > 0);
      } else {
        result = result.filter((s) => s.categories?.includes(selectedCategory));
      }
    }
    setFiltered(result);
  }, [search, selectedCategory, stores]);

  async function onRefresh() {
    setRefreshing(true);
    await loadStores(userLocation);
    setRefreshing(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={{ color: '#9CA3AF', marginTop: 12 }}>Buscando tiendas cercanas...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: GREEN }}>Tiendas 🛒</Text>
          {userLocation && (
            <View style={{ backgroundColor: '#ECFDF5', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: '#059669', fontSize: 11, fontWeight: '600' }}>📍 Ordenadas por cercanía</Text>
            </View>
          )}
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 }}>
          <Text style={{ color: '#9CA3AF', marginRight: 8 }}>🔍</Text>
          <TextInput
            style={{ flex: 1, paddingVertical: 12, fontSize: 15 }}
            placeholder="Buscar tienda o producto..."
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={{
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1,
                  backgroundColor: selectedCategory === cat ? GREEN : '#fff',
                  borderColor: selectedCategory === cat ? GREEN : '#E5E7EB',
                }}
              >
                <Text style={{ fontSize: 13, color: selectedCategory === cat ? '#fff' : '#6B7280', fontWeight: selectedCategory === cat ? '600' : '400' }}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
      >
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 64 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🏪</Text>
            <Text style={{ color: '#6B7280', fontSize: 15, fontWeight: '600' }}>
              {stores.length === 0 ? 'No hay tiendas disponibles' : 'Sin resultados para esa búsqueda'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 14, paddingTop: 8, paddingBottom: 40 }}>
            {filtered.map((store) => (
              <TouchableOpacity
                key={store.id}
                onPress={() => router.push(`/(owner)/store/${store.id}` as any)}
                style={{ backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' }}
                activeOpacity={0.85}
              >
                {/* Banner / logo */}
                {store.logoUrl ? (
                  <Image source={{ uri: store.logoUrl }} style={{ width: '100%', height: 120 }} contentFit="cover" />
                ) : (
                  <View style={{ width: '100%', height: 100, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 40 }}>🏪</Text>
                  </View>
                )}
                <View style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#1F2937' }}>{store.name}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }} numberOfLines={2}>{store.description}</Text>
                    </View>
                    {store.distanceKm != null && (
                      <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 }}>
                        <Text style={{ color: '#3B82F6', fontSize: 12, fontWeight: '700' }}>
                          {store.distanceKm < 1 ? `${Math.round(store.distanceKm * 1000)} m` : `${store.distanceKm.toFixed(1)} km`}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Info row */}
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                    {store.address ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 12 }}>📍</Text>
                        <Text style={{ color: '#9CA3AF', fontSize: 12 }} numberOfLines={1}>{store.address}</Text>
                      </View>
                    ) : null}
                    {store.phone ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 12 }}>📞</Text>
                        <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{store.phone}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Tags */}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {store.services && store.services.filter((s) => s.isActive).length > 0 && (
                      <View style={{ backgroundColor: '#EDE9FE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: '#7C3AED', fontSize: 11, fontWeight: '600' }}>
                          ✂️ {store.services.filter((s) => s.isActive).length} servicios
                        </Text>
                      </View>
                    )}
                    {store.categories?.slice(0, 3).map((cat) => (
                      <View key={cat} style={{ backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: '#D97706', fontSize: 11, fontWeight: '600' }}>{cat}</Text>
                      </View>
                    ))}
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
