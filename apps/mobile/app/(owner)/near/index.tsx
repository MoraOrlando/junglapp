import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { regionScopedQuery } from '../../../lib/nearbyQuery';
import { ownerFilterRegionKey } from '../../../lib/locationKey';
import { logNearSearchUsed, logNearResultOpened } from '../../../lib/analytics';
import type { UserAddress, Store, Product } from '@junglapp/types';

const { db } = initFirebase();

const GREEN = '#2D6A4F';

interface PromoItem extends Product {
  storeName: string;
}

interface SearchResult {
  id: string;
  kind: 'vet' | 'walker' | 'store' | 'groomer' | 'trainer';
  name: string;
  subtitle: string;
  emoji: string;
  route: string;
}

function matchesLocation(itemCity: string, itemRegion: string | undefined, city: string | null, region: string | null) {
  if (!city && !region) return true;
  if (city) {
    const cityMatch = itemCity?.toLowerCase().includes(city.toLowerCase()) ||
      city.toLowerCase().includes(itemCity?.toLowerCase() ?? '');
    if (cityMatch) return true;
  }
  if (region && itemRegion) {
    return itemRegion.toLowerCase().includes(region.toLowerCase()) ||
      region.toLowerCase().includes(itemRegion.toLowerCase());
  }
  if (!itemCity && !itemRegion) return true;
  return false;
}

type Category = 'vet' | 'veterinaria' | 'urgencias' | 'walker' | 'store' | 'groomer' | 'trainer' | 'entretencion';

const CATEGORIES: { id: Category; label: string; emoji: string; color: string }[] = [
  { id: 'vet', label: 'Veterinarios', emoji: '🩺', color: '#EFF6FF' },
  { id: 'veterinaria', label: 'Veterinarias', emoji: '🏥', color: '#EFF6FF' },
  { id: 'urgencias', label: 'Urgencias', emoji: '🚨', color: '#FEF2F2' },
  { id: 'walker', label: 'Paseadores', emoji: '🦮', color: '#F0FDF4' },
  { id: 'store', label: 'Tiendas', emoji: '🛒', color: '#FEF3C7' },
  { id: 'groomer', label: 'Peluquerías', emoji: '✂️', color: '#FAF5FF' },
  { id: 'trainer', label: 'Entrenadores', emoji: '🎓', color: '#FFF7ED' },
  { id: 'entretencion', label: 'Entretención', emoji: '🐾', color: '#ECFEFF' },
];

export default function NearScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const [currentCity, setCurrentCity] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [promos, setPromos] = useState<PromoItem[]>([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [allProviders, setAllProviders] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const hasLoggedSearch = useRef(false);

  useEffect(() => {
    if (searchQuery.trim() && !hasLoggedSearch.current) {
      hasLoggedSearch.current = true;
      logNearSearchUsed();
    } else if (!searchQuery.trim()) {
      hasLoggedSearch.current = false;
    }
  }, [searchQuery]);

  async function detectLocation(): Promise<{ city: string | null; region: string | null }> {
    // Use saved address if available
    const addresses: any[] = (user as any)?.addresses ?? [];
    const selectedId = (user as any)?.selectedAddressId;
    const selectedAddr = addresses.find((a) => a.id === selectedId) ?? addresses[0];
    if (selectedAddr?.city) {
      setCurrentCity(selectedAddr.city);
      return { city: selectedAddr.city, region: selectedAddr.region ?? null };
    }

    // Fallback to GPS
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setCurrentCity(user?.city ?? null); return { city: user?.city ?? null, region: user?.region ?? null }; }
      setLocating(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const city = geo?.city ?? geo?.subregion ?? user?.city ?? null;
      const region = geo?.region ?? user?.region ?? null;
      setCurrentCity(city);
      return { city, region };
    } catch {
      setCurrentCity(user?.city ?? null);
      return { city: user?.city ?? null, region: user?.region ?? null };
    } finally {
      setLocating(false);
    }
  }

  async function loadPromos() {
    try {
      const { city, region } = await detectLocation();
      const storesSnap = await getDocs(regionScopedQuery(COLLECTIONS.STORES, ownerFilterRegionKey(user)));
      const nearbyStores = storesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Store))
        .filter((s) => matchesLocation((s as any).city ?? '', (s as any).region, city, region));
      if (nearbyStores.length === 0) { setPromos([]); return; }

      const storeNameById = new Map(nearbyStores.map((s) => [s.id, s.name]));
      // Firestore `in` queries cap at 30 values.
      const storeIds = nearbyStores.map((s) => s.id).slice(0, 30);
      const productsSnap = await getDocs(query(
        collection(db, COLLECTIONS.PRODUCTS),
        where('storeId', 'in', storeIds),
        where('isActive', '==', true),
      ));
      const onSale = productsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Product))
        .filter((p) => p.originalPrice != null && p.originalPrice > p.price && p.promotionStatus === 'approved')
        .map((p) => ({ ...p, storeName: storeNameById.get(p.storeId) ?? '' } as PromoItem))
        .sort((a, b) => {
          const discountA = 1 - a.price / (a.originalPrice as number);
          const discountB = 1 - b.price / (b.originalPrice as number);
          return discountB - discountA;
        })
        .slice(0, 15);
      setPromos(onSale);
    } catch {
      setPromos([]);
    } finally {
      setLoadingPromos(false);
    }
  }

  async function loadProviders() {
    try {
      const filterRegionKey = ownerFilterRegionKey(user);
      const [vetSnap, walkerSnap, storeSnap, groomerSnap, trainerSnap] = await Promise.all([
        getDocs(regionScopedQuery(COLLECTIONS.VETERINARIANS, filterRegionKey)),
        getDocs(regionScopedQuery(COLLECTIONS.WALKERS, filterRegionKey)),
        getDocs(regionScopedQuery(COLLECTIONS.STORES, filterRegionKey)),
        getDocs(regionScopedQuery(COLLECTIONS.GROOMERS, filterRegionKey)),
        getDocs(regionScopedQuery(COLLECTIONS.TRAINERS, filterRegionKey)),
      ]);
      const results: SearchResult[] = [
        ...vetSnap.docs.map((d) => {
          const v = d.data() as any;
          // isClinic must be an explicit choice — solo vets can also pick
          // "servicios ofrecidos", so clinicServices is not a valid signal.
          const isClinic = v.isClinic ?? false;
          return {
            id: d.id, kind: 'vet' as const,
            name: isClinic ? (v.name ?? '') : `Dr. ${v.name ?? ''}`,
            subtitle: isClinic ? 'Veterinaria' : 'Veterinario',
            emoji: isClinic ? '🏥' : '🩺',
            route: `/(owner)/vets/${d.id}`,
          };
        }),
        ...walkerSnap.docs.map((d) => {
          const w = d.data() as any;
          return { id: d.id, kind: 'walker' as const, name: w.name ?? '', subtitle: 'Paseador / Cuidador', emoji: '🦮', route: `/(owner)/walkers/${d.id}` };
        }),
        ...storeSnap.docs.map((d) => {
          const s = d.data() as any;
          return { id: d.id, kind: 'store' as const, name: s.name ?? '', subtitle: 'Tienda de mascotas', emoji: '🛒', route: `/(owner)/store/${d.id}` };
        }),
        ...groomerSnap.docs.map((d) => {
          const g = d.data() as any;
          return { id: d.id, kind: 'groomer' as const, name: g.businessName || g.name || '', subtitle: 'Peluquería', emoji: '✂️', route: `/(owner)/groomers/${d.id}` };
        }),
        ...trainerSnap.docs.map((d) => {
          const t = d.data() as any;
          return { id: d.id, kind: 'trainer' as const, name: t.name ?? '', subtitle: 'Entrenador canino', emoji: '🎓', route: `/(owner)/trainers/${d.id}` };
        }),
      ];
      setAllProviders(results);
    } catch {
      setAllProviders([]);
    }
  }

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allProviders
      .filter((p) => {
        const name = p.name.toLowerCase();
        return name.startsWith(q) || name.split(' ').some((word) => word.startsWith(q));
      })
      .slice(0, 30);
  }, [searchQuery, allProviders]);

  const selectedAddressId = (user as any)?.selectedAddressId ?? null;
  useFocusEffect(useCallback(() => {
    if (!user) return;
    setLoadingPromos(true);
    loadPromos().catch(() => setLoadingPromos(false));
    loadProviders();
  }, [user?.uid, selectedAddressId]));

  const addresses: UserAddress[] = (user as any)?.addresses ?? [];

  async function selectAddress(id: string) {
    if (!user) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { selectedAddressId: id });
      await updateProfile({ selectedAddressId: id } as any);
    } catch {}
    setShowAddressPicker(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Address picker modal */}
      <Modal visible={showAddressPicker} animationType="slide" transparent>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowAddressPicker(false)}
        >
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B', marginBottom: 4 }}>Seleccionar dirección</Text>
            <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>Los servicios mostrados serán de esa zona</Text>

            {addresses.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Text style={{ color: '#94A3B8', fontSize: 14, marginBottom: 12 }}>No tienes direcciones guardadas</Text>
                <TouchableOpacity
                  onPress={() => { setShowAddressPicker(false); router.push('/(owner)/addresses' as any); }}
                  style={{ backgroundColor: '#16A34A', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Agregar dirección</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {addresses.map((addr) => {
                  const isSelected = addr.id === selectedAddressId;
                  return (
                    <TouchableOpacity
                      key={addr.id}
                      onPress={() => selectAddress(addr.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                        borderRadius: 16, borderWidth: 2,
                        borderColor: isSelected ? '#1D4ED8' : '#E2E8F0',
                        backgroundColor: isSelected ? '#EFF6FF' : '#F8FAFC',
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{isSelected ? '✅' : '📍'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: '#1E293B' }}>{addr.label}</Text>
                        <Text style={{ color: '#64748B', fontSize: 12 }}>{addr.address}</Text>
                        <Text style={{ color: '#94A3B8', fontSize: 11 }}>{addr.city} · {addr.region}</Text>
                      </View>
                      {isSelected && <Text style={{ color: '#1D4ED8', fontSize: 11, fontWeight: '700' }}>ACTIVA</Text>}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => { setShowAddressPicker(false); router.push('/(owner)/addresses' as any); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginTop: 4 }}
                >
                  <Text style={{ color: '#1D4ED8', fontSize: 14, fontWeight: '600' }}>+ Administrar direcciones</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={{ backgroundColor: GREEN, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff' }}>Cerca de ti</Text>
        <TouchableOpacity
          onPress={() => setShowAddressPicker(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}
        >
          {locating
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ fontSize: 13 }}>📍</Text>
          }
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
            {currentCity ?? 'Detectando ubicación...'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>▼</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingHorizontal: 14, height: 44, gap: 8, marginTop: 14 }}>
          <Text style={{ fontSize: 15 }}>🔍</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Busca veterinario, paseador, tienda o peluquería..."
            placeholderTextColor="rgba(255,255,255,0.7)"
            autoCorrect={false}
            style={{ flex: 1, color: '#fff', fontSize: 14 }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Text style={{ color: '#fff', fontSize: 15 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {searchQuery.trim().length > 0 ? (
          <View style={{ paddingHorizontal: 24 }}>
            <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 14 }}>
              {searchResults.length > 0
                ? `${searchResults.length} resultado${searchResults.length === 1 ? '' : 's'} para "${searchQuery.trim()}"`
                : `Sin resultados para "${searchQuery.trim()}"`}
            </Text>
            <View style={{ gap: 12 }}>
              {searchResults.map((r) => (
                <TouchableOpacity
                  key={`${r.kind}-${r.id}`}
                  onPress={() => {
                    logNearResultOpened(r.kind);
                    // See near/[category].tsx — providers live in their own
                    // hidden tab stacks, so router.back() from there has
                    // nowhere to pop to without an explicit return path.
                    router.push(`${r.route}?backTo=${encodeURIComponent('/(owner)/near')}` as any);
                  }}
                  style={{
                    backgroundColor: '#fff', borderRadius: 18, padding: 14,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    borderWidth: 1, borderColor: '#F1F5F9',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                  }}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 24 }}>{r.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15 }}>{r.name}</Text>
                    <Text style={{ color: '#64748B', fontSize: 12, marginTop: 1 }}>{r.subtitle}</Text>
                  </View>
                  <Text style={{ color: '#CBD5E1', fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
        <>
        {!loadingPromos && promos.length > 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 20, backgroundColor: '#FEF2F2', borderRadius: 22, paddingTop: 16, paddingBottom: 4, borderWidth: 1, borderColor: '#FEE2E2' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#DC2626', paddingHorizontal: 16, marginBottom: 10 }}>
              🔥 Ofertas cerca de ti
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
              {promos.map((p) => {
                const discountPct = Math.round((1 - p.price / (p.originalPrice as number)) * 100);
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push(`/(owner)/store/${p.storeId}` as any)}
                    style={{
                      width: 150, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
                      borderWidth: 1, borderColor: '#F1F5F9',
                      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
                    }}
                  >
                    <View style={{ width: '100%', height: 110, backgroundColor: '#FEF3C7' }}>
                      {p.photos?.[0] ? (
                        <Image source={{ uri: p.photos[0] }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 30 }}>🛒</Text>
                        </View>
                      )}
                      <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>-{discountPct}%</Text>
                      </View>
                    </View>
                    <View style={{ padding: 10 }}>
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>{p.name}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{p.storeName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#16A34A' }}>
                          ${p.price.toLocaleString('es-CL')}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#94A3B8', textDecorationLine: 'line-through' }}>
                          ${(p.originalPrice as number).toLocaleString('es-CL')}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 14, paddingHorizontal: 24 }}>
          Elige una categoría para ver los prestadores más cercanos a ti.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 24 }}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => router.push(`/(owner)/near/${c.id}` as any)}
              style={{
                width: '47%',
                backgroundColor: c.color,
                borderRadius: 20,
                paddingVertical: 24,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#F1F5F9',
              }}
            >
              <Text style={{ fontSize: 34, marginBottom: 8 }}>{c.emoji}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
