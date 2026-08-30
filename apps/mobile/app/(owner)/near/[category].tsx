import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getDocs, collection } from 'firebase/firestore';
import * as Location from 'expo-location';
import { COLLECTIONS, initFirebase } from '@junglapp/firebase';
import type { Subscription } from '@junglapp/types';

const { db } = initFirebase();
import { useAuth } from '../../../context/AuthContext';
import { distanceKm, hasUpcomingAvailability } from '../../../lib/distance';
import { regionScopedQuery } from '../../../lib/nearbyQuery';
import { getQuickPosition } from '../../../lib/location';
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
  plan?: 'basic' | 'premium';
  // Set for kind 'vet'/'veterinaria'/'walker'/'trainer' — whether the
  // account's documents were reviewed and approved by soporte. Ranks above
  // unverified results, same tier as the premium-plan boost. Undefined for
  // 'store'/'groomer', which don't have this review flow — both sides tie
  // and the sort falls through to distance/rating as before.
  isVerified?: boolean;
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
        const pos = await getQuickPosition();
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
    const filterRegionKey = ownerFilterRegionKey(user);
    // cat is one of exactly these 7 values (see Category type above) — the
    // final branch covers 'trainer', not a fallback default.
    const dataQuery =
      cat === 'vet' || cat === 'veterinaria' || cat === 'urgencias' ? regionScopedQuery(COLLECTIONS.VETERINARIANS, filterRegionKey) :
      cat === 'store' ? regionScopedQuery(COLLECTIONS.STORES, filterRegionKey) :
      cat === 'groomer' ? regionScopedQuery(COLLECTIONS.GROOMERS, filterRegionKey) :
      cat === 'walker' ? regionScopedQuery(COLLECTIONS.WALKERS, filterRegionKey) :
      regionScopedQuery(COLLECTIONS.TRAINERS, filterRegionKey);

    // GPS/reverse-geocode and the Firestore reads don't depend on each
    // other — filterRegionKey comes from saved address data, not GPS — so
    // run them concurrently instead of one after another (this sequential
    // chain was the 2-3s delay on every category load).
    const [{ city, region, coords }, dataSnap, subsSnap] = await Promise.all([
      detectOwnerLocation(),
      getDocs(dataQuery),
      getDocs(collection(db, COLLECTIONS.SUBSCRIPTIONS)),
    ]);

    let list: NearItem[] = [];

    if (cat === 'vet' || cat === 'veterinaria' || cat === 'urgencias') {
      const snap = dataSnap;
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Veterinarian))
        .filter((v) => {
          const statusOk = (v as any).status === 'approved' || isRecent(v);
          if (!statusOk || !matchesLocation((v as any).city ?? '', (v as any).region, city, region)) return false;
          // isClinic must be an explicit choice — solo vets can also pick
          // "servicios ofrecidos", so clinicServices is not a valid signal.
          // Legacy docs without the field set default to solo practitioner.
          const isClinic = v.isClinic ?? false;
          if (cat === 'vet') return !isClinic;
          if (cat === 'veterinaria') return isClinic;
          return v.is24_7 === true; // urgencias
        })
        .map((v) => {
          // isClinic must be an explicit choice — solo vets can also pick
          // "servicios ofrecidos", so clinicServices is not a valid signal.
          // Legacy docs without the field set default to solo practitioner.
          const isClinic = v.isClinic ?? false;
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
            isVerified: (v as any).status === 'approved',
          };
        });
    } else if (cat === 'store') {
      const snap = dataSnap;
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
      const snap = dataSnap;
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
      const snap = dataSnap;
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        // Rejected accounts must never appear, even inside the "recent
        // signup" grace period below — that period exists so a brand-new
        // pending walker isn't invisible for days, not to leak rejections.
        .filter((w) => (w.status === 'approved' || (w.status !== 'rejected' && isRecent(w))) && matchesLocation(w.city ?? '', w.region, city, region))
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
          isVerified: w.status === 'approved',
        }));
    } else if (cat === 'trainer') {
      const snap = dataSnap;
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        // Same rule as walkers above — rejected never shows, regardless of
        // how recently the account was created.
        .filter((t) => (t.status === 'approved' || (t.status !== 'rejected' && isRecent(t))) && matchesLocation(t.city ?? '', t.region, city, region))
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
          isVerified: t.status === 'approved',
        }));
    }

    // Premium accounts appear first in every category — see subscriptions/{id}
    // (Cloud Functions write plan changes are support-only, see
    // firestore.rules). Fetched as a flat map rather than an `in` query
    // scoped to this category's ids: simpler, and the collection is small
    // enough that downloading it whole isn't a real cost.
    const planById = new Map<string, 'basic' | 'premium'>();
    subsSnap.docs.forEach((d) => planById.set(d.id, (d.data() as Subscription).plan));

    // Distance from the owner's live GPS position to each provider's captured location
    const withDistance = list.map((it) => ({
      ...it,
      plan: planById.get(it.id) ?? 'premium',
      distanceKm: (coords && it.location) ? distanceKm(coords.lat, coords.lng, it.location.lat, it.location.lng) : undefined,
    }));

    function byPlanThenDistanceThenRating(a: NearItem, b: NearItem) {
      const planA = a.plan === 'premium' ? 0 : 1;
      const planB = b.plan === 'premium' ? 0 : 1;
      if (planA !== planB) return planA - planB;
      // Verified accounts (soporte-approved: vets/clinics, walkers,
      // trainers) rank above unverified/pending — undefined on categories
      // without a review flow (store, groomer), where both sides tie at 1
      // and this tier is a no-op, falling through to distance/rating.
      const verifiedA = a.isVerified ? 0 : 1;
      const verifiedB = b.isVerified ? 0 : 1;
      if (verifiedA !== verifiedB) return verifiedA - verifiedB;
      if (a.distanceKm != null && b.distanceKm != null) {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        return (b.rating ?? 0) - (a.rating ?? 0);
      }
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return (b.rating ?? 0) - (a.rating ?? 0);
    }

    if (cat === 'vet' || cat === 'veterinaria' || cat === 'urgencias') {
      const available = withDistance.filter((it) => it.hasAvailability).sort(byPlanThenDistanceThenRating);
      const unavailable = withDistance.filter((it) => !it.hasAvailability).sort(byPlanThenDistanceThenRating);
      setItems([...available, ...unavailable]);
    } else {
      setItems([...withDistance].sort(byPlanThenDistanceThenRating));
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
                        {it.isVerified && (
                          <View style={{ backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '700' }}>✅ Verificado</Text>
                          </View>
                        )}
                        {!it.isVerified && (it.kind === 'walker' || it.kind === 'trainer') && (
                          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '700' }}>⏳ En proceso</Text>
                          </View>
                        )}
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
