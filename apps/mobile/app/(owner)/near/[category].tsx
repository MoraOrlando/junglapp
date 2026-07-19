import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getDocs } from 'firebase/firestore';
import * as Location from 'expo-location';
import { COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { distanceKm, hasUpcomingAvailability } from '../../../lib/distance';
import { regionScopedQuery } from '../../../lib/nearbyQuery';
import { ownerFilterRegionKey } from '../../../lib/locationKey';
import { logNearCategoryViewed, logNearResultOpened } from '../../../lib/analytics';
import type { Veterinarian, Store } from '@junglapp/types';

type Category = 'vet' | 'veterinaria' | 'urgencias' | 'walker' | 'store' | 'groomer' | 'trainer';

const CATEGORY_META: Record<Category, { title: string; emoji: string; color: string }> = {
  vet: { title: 'Veterinarios', emoji: '🩺', color: '#1D4ED8' },
  veterinaria: { title: 'Veterinarias', emoji: '🏥', color: '#1D4ED8' },
  urgencias: { title: 'Urgencias 24/7', emoji: '🚨', color: '#DC2626' },
  walker: { title: 'Paseadores', emoji: '🦮', color: '#16A34A' },
  store: { title: 'Tiendas', emoji: '🛒', color: '#D97706' },
  groomer: { title: 'Peluquerías', emoji: '✂️', color: '#9333EA' },
  trainer: { title: 'Entrenadores', emoji: '🎓', color: '#EA580C' },
};

const SERVICE_LABELS: Record<string, string> = {
  veterinaria: '🩺 Veterinaria',
  peluqueria: '✂️ Peluquería',
  rayos_x: '🩻 Rayos X',
  intervenciones: '🔬 Intervenciones',
};

interface NearItem {
  id: string;
  kind: 'vet' | 'veterinaria' | 'store' | 'groomer' | 'walker' | 'trainer';
  name: string;
  address: string;
  emoji: string;
  photoUrl?: string;
  subtitle?: string;
  route: string;
  rating?: number;
  reviewCount?: number;
  consultationFee?: number;
  is24_7?: boolean;
  openingHours?: string;
  clinicServices?: string[];
  location?: { lat: number; lng: number };
  hasAvailability?: boolean;
  distanceKm?: number;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default function NearCategoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { category } = useLocalSearchParams<{ category: string }>();
  const cat = (category as Category) in CATEGORY_META ? (category as Category) : 'vet';
  const meta = CATEGORY_META[cat];

  const [items, setItems] = useState<NearItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function detectOwnerLocation(): Promise<{ city: string | null; region: string | null; coords: { lat: number; lng: number } | null; filterRegionKey: string | null }> {
    const addresses: any[] = (user as any)?.addresses ?? [];
    const selectedId = (user as any)?.selectedAddressId;
    const selectedAddr = addresses.find((a) => a.id === selectedId) ?? addresses[0];
    let city = selectedAddr?.city ?? null;
    let region = selectedAddr?.region ?? null;
    let coords: { lat: number; lng: number } | null = null;

    const filterRegionKey = ownerFilterRegionKey(user);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!city) {
          const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          city = geo?.city ?? geo?.subregion ?? null;
          region = geo?.region ?? null;
        }
      }
    } catch { /* sin ubicación — se filtra solo por dirección guardada / ciudad de perfil */ }

    if (!city) { city = user?.city ?? null; }
    if (!region) { region = user?.region ?? null; }
    return { city, region, coords, filterRegionKey };
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

  function isRecent(data: any) {
    const c = data.createdAt ? new Date(data.createdAt).getTime() : 0;
    return c > 0 && Date.now() - c < NINETY_DAYS_MS;
  }

  async function loadData() {
    if (!user) return;
    const { city, region, coords, filterRegionKey } = await detectOwnerLocation();

    let list: NearItem[] = [];

    if (cat === 'vet' || cat === 'veterinaria' || cat === 'urgencias') {
      const snap = await getDocs(regionScopedQuery(COLLECTIONS.VETERINARIANS, filterRegionKey));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Veterinarian))
        .filter((v) => {
          const statusOk = (v as any).status === 'approved' || isRecent(v);
          if (!statusOk || !matchesLocation((v as any).city ?? '', (v as any).region, city, region)) return false;
          // isClinic must be an explicit choice, not inferred from is24_7 — a
          // solo vet offering 24/7 urgent care isn't necessarily a clinic.
          // Legacy docs without the field set fall back to clinicServices only.
          const isClinic = v.isClinic ?? ((v.clinicServices?.length ?? 0) > 0);
          if (cat === 'vet') return !isClinic;
          if (cat === 'veterinaria') return isClinic;
          return v.is24_7 === true; // urgencias
        })
        .map((v) => {
          // isClinic must be an explicit choice, not inferred from is24_7 — a
          // solo vet offering 24/7 urgent care isn't necessarily a clinic.
          // Legacy docs without the field set fall back to clinicServices only.
          const isClinic = v.isClinic ?? ((v.clinicServices?.length ?? 0) > 0);
          return {
            id: v.id,
            kind: (isClinic ? 'veterinaria' : 'vet') as 'vet' | 'veterinaria',
            name: isClinic ? v.name : `Dr. ${v.name}`,
            address: v.address,
            emoji: isClinic ? '🏥' : '🩺',
            subtitle: v.consultationFee ? `$${v.consultationFee.toLocaleString('es-CL')} consulta` : undefined,
            route: `/(owner)/vets/${v.id}`,
            rating: v.rating,
            reviewCount: v.reviewCount,
            consultationFee: v.consultationFee,
            is24_7: v.is24_7,
            openingHours: v.openingHours,
            clinicServices: v.clinicServices,
            location: v.location,
            hasAvailability: !!v.is24_7 || hasUpcomingAvailability(v.availability as any),
          };
        });
    } else if (cat === 'store') {
      const snap = await getDocs(regionScopedQuery(COLLECTIONS.STORES, filterRegionKey));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Store))
        .filter((s) => {
          const statusOk = (s as any).status === 'approved' || isRecent(s);
          return statusOk && matchesLocation((s as any).city ?? '', (s as any).region, city, region);
        })
        .map((s) => ({
          id: s.id,
          kind: 'store' as const,
          name: s.name,
          address: s.address,
          emoji: '🛒',
          photoUrl: (s as any).photoUrl ?? undefined,
          subtitle: 'Tienda de mascotas',
          route: `/(owner)/store/${s.id}`,
          location: (s as any).location,
        }));
    } else if (cat === 'groomer') {
      const snap = await getDocs(regionScopedQuery(COLLECTIONS.GROOMERS, filterRegionKey));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((g) => (g.status === 'approved' || isRecent(g)) && matchesLocation(g.city ?? '', g.region, city, region))
        .map((g) => ({
          id: g.id,
          kind: 'groomer' as const,
          name: g.businessName || g.name,
          address: g.address || g.city || '',
          emoji: '✂️',
          photoUrl: g.photoUrl,
          subtitle: g.serviceType === 'home' ? 'Peluquería a domicilio' : 'Peluquería en tienda',
          route: `/(owner)/groomers/${g.id}`,
          rating: g.rating,
          reviewCount: g.reviewCount,
          location: g.location,
        }));
    } else if (cat === 'walker') {
      const snap = await getDocs(regionScopedQuery(COLLECTIONS.WALKERS, filterRegionKey));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((w) => (w.status === 'approved' || isRecent(w)) && matchesLocation(w.city ?? '', w.region, city, region))
        .map((w) => ({
          id: w.id,
          kind: 'walker' as const,
          name: w.name,
          address: w.city || '',
          emoji: '🦮',
          photoUrl: w.photoUrl,
          subtitle: w.walkFee ? `$${w.walkFee.toLocaleString('es-CL')} por paseo` : 'Paseador de perros',
          route: `/(owner)/walkers/${w.id}`,
          rating: w.rating,
          reviewCount: w.reviewCount,
          location: w.location,
        }));
    } else if (cat === 'trainer') {
      const snap = await getDocs(regionScopedQuery(COLLECTIONS.TRAINERS, filterRegionKey));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((t) => (t.status === 'approved' || isRecent(t)) && matchesLocation(t.city ?? '', t.region, city, region))
        .map((t) => ({
          id: t.id,
          kind: 'trainer' as const,
          name: t.name,
          address: t.city || '',
          emoji: '🎓',
          photoUrl: t.photoUrl,
          subtitle: 'Entrenador canino',
          route: `/(owner)/trainers/${t.id}`,
          rating: t.rating,
          reviewCount: t.reviewCount,
          location: t.location,
        }));
    }

    // Distance from the owner's live GPS position to each provider's captured location
    const withDistance = list.map((it) => ({
      ...it,
      distanceKm: (coords && it.location) ? distanceKm(coords.lat, coords.lng, it.location.lat, it.location.lng) : undefined,
    }));

    function byDistanceThenRating(a: NearItem, b: NearItem) {
      if (a.distanceKm != null && b.distanceKm != null) {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        return (b.rating ?? 0) - (a.rating ?? 0);
      }
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return (b.rating ?? 0) - (a.rating ?? 0);
    }

    if (cat === 'vet' || cat === 'veterinaria' || cat === 'urgencias') {
      const available = withDistance.filter((it) => it.hasAvailability).sort(byDistanceThenRating);
      const unavailable = withDistance.filter((it) => !it.hasAvailability).sort(byDistanceThenRating);
      setItems([...available, ...unavailable]);
    } else {
      setItems([...withDistance].sort(byDistanceThenRating));
    }
  }

  useFocusEffect(useCallback(() => {
    logNearCategoryViewed(cat);
    setLoading(true);
    loadData().catch(() => {}).finally(() => setLoading(false));
  }, [user?.uid, cat]));

  async function onRefresh() {
    setRefreshing(true);
    await loadData().catch(() => {});
    setRefreshing(false);
  }

  function formatDistance(km: number) {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ fontSize: 22, color: meta.color }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: meta.color }}>{meta.emoji} {meta.title}</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={meta.color} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 24 }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={meta.color} />}
        >
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>{meta.emoji}</Text>
              <Text style={{ color: '#94A3B8', fontSize: 15 }}>No hay servicios disponibles aún</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {items.map((it) => {
                const showNoAvailability = (cat === 'vet' || cat === 'veterinaria') && it.hasAvailability === false;
                return (
                  <TouchableOpacity
                    key={`${it.kind}-${it.id}`}
                    onPress={() => {
                      logNearResultOpened(it.kind);
                      // vets/store/walkers/groomers/trainers live in their own
                      // hidden tab stacks, not this one — router.back() from
                      // there has nothing to pop to and falls through to the
                      // Inicio tab. Pass an explicit return path instead.
                      const backTo = encodeURIComponent(`/(owner)/near/${cat}`);
                      router.push(`${it.route}?backTo=${backTo}` as any);
                    }}
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
                      opacity: showNoAvailability ? 0.75 : 1,
                    }}
                  >
                    {it.photoUrl ? (
                      <Image source={{ uri: it.photoUrl }} style={{ width: 64, height: 64, borderRadius: 16 }} contentFit="cover" />
                    ) : (
                      <View style={{
                        width: 64, height: 64, borderRadius: 16,
                        backgroundColor: it.kind === 'vet' || it.kind === 'veterinaria' ? '#EFF6FF' : it.kind === 'groomer' ? '#FAF5FF' : it.kind === 'walker' ? '#F0FDF4' : it.kind === 'trainer' ? '#FFF7ED' : '#FEF3C7',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 30 }}>{it.emoji}</Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, marginBottom: 2 }}>{it.name}</Text>
                      <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 4 }}>{it.address}</Text>

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                        {it.distanceKm != null && (
                          <View style={{ backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#1D4ED8', fontWeight: '700' }}>📍 {formatDistance(it.distanceKm)}</Text>
                          </View>
                        )}
                        {(it.kind === 'vet' || it.kind === 'veterinaria') && it.is24_7 && (
                          <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>🚨 Urgencias 24/7</Text>
                          </View>
                        )}
                        {(it.kind === 'vet' || it.kind === 'veterinaria') && !it.is24_7 && it.openingHours ? (
                          <View style={{ backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>🕐 {it.openingHours}</Text>
                          </View>
                        ) : null}
                        {showNoAvailability && (
                          <View style={{ backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '700' }}>🗓️ Sin agenda disponible</Text>
                          </View>
                        )}
                        {(it.kind === 'vet' || it.kind === 'veterinaria') && (it.clinicServices ?? []).map((s) => (
                          <View key={s} style={{ backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#1D4ED8', fontWeight: '600' }}>{SERVICE_LABELS[s] ?? s}</Text>
                          </View>
                        ))}
                      </View>

                      {(it.kind === 'vet' || it.kind === 'veterinaria') && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>
                            ⭐ {it.rating ? it.rating.toFixed(1) : 'Sin reseñas'}
                            {it.reviewCount ? ` (${it.reviewCount})` : ''}
                          </Text>
                          {it.consultationFee !== undefined && it.consultationFee > 0 && (
                            <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '600' }}>
                              💰 ${it.consultationFee.toLocaleString('es-CL')}
                            </Text>
                          )}
                        </View>
                      )}

                      {it.kind !== 'vet' && it.kind !== 'veterinaria' && it.rating != null && (
                        <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>
                          ⭐ {it.rating.toFixed(1)}{it.reviewCount ? ` (${it.reviewCount})` : ''}
                        </Text>
                      )}

                      {it.kind === 'store' && it.subtitle && (
                        <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '500' }}>{it.subtitle}</Text>
                      )}
                    </View>

                    <Text style={{ color: '#CBD5E1', fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
