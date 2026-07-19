import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { distanceKm, hasUpcomingAvailability } from '../../lib/distance';
import type { Veterinarian, Store } from '@junglapp/types';

const { db } = initFirebase();

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

interface GuestItem {
  id: string;
  type: 'vet' | 'store' | 'groomer' | 'walker' | 'trainer';
  name: string;
  address: string;
  emoji: string;
  photoUrl?: string;
  rating?: number;
  reviewCount?: number;
  is24_7?: boolean;
  location?: { lat: number; lng: number };
  hasAvailability?: boolean;
  distanceKm?: number;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default function GuestCategoryScreen() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const cat = (category as Category) in CATEGORY_META ? (category as Category) : 'vet';
  const meta = CATEGORY_META[cat];

  const [items, setItems] = useState<GuestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  function isRecent(data: any) {
    const c = data.createdAt ? new Date(data.createdAt).getTime() : 0;
    return c > 0 && Date.now() - c < NINETY_DAYS_MS;
  }

  async function loadData() {
    let coords: { lat: number; lng: number } | null = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch { /* sin ubicación — se muestra sin ordenar por distancia */ }

    let list: GuestItem[] = [];

    if (cat === 'vet' || cat === 'veterinaria' || cat === 'urgencias') {
      const snap = await getDocs(query(collection(db, COLLECTIONS.VETERINARIANS), where('status', 'in', ['approved', 'pending'])));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Veterinarian))
        .filter((v) => {
          if (!((v as any).status === 'approved' || isRecent(v))) return false;
          // isClinic must be an explicit choice, not inferred from is24_7 — a
          // solo vet offering 24/7 urgent care isn't necessarily a clinic.
          // Legacy docs without the field set fall back to clinicServices only.
          const isClinic = v.isClinic ?? ((v.clinicServices?.length ?? 0) > 0);
          if (cat === 'vet') return !isClinic;
          if (cat === 'veterinaria') return isClinic;
          return v.is24_7 === true;
        })
        .map((v) => {
          // isClinic must be an explicit choice, not inferred from is24_7 — a
          // solo vet offering 24/7 urgent care isn't necessarily a clinic.
          // Legacy docs without the field set fall back to clinicServices only.
          const isClinic = v.isClinic ?? ((v.clinicServices?.length ?? 0) > 0);
          return {
            id: v.id,
            type: 'vet' as const,
            name: isClinic ? v.name : `Dr. ${v.name}`,
            address: v.address,
            emoji: isClinic ? '🏥' : '🩺',
            rating: v.rating,
            reviewCount: v.reviewCount,
            is24_7: v.is24_7,
            location: v.location,
            hasAvailability: !!v.is24_7 || hasUpcomingAvailability(v.availability as any),
          };
        });
    } else if (cat === 'store') {
      const snap = await getDocs(query(collection(db, COLLECTIONS.STORES), where('status', 'in', ['approved', 'pending'])));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Store))
        .filter((s) => (s as any).status === 'approved' || isRecent(s))
        .map((s) => ({
          id: s.id,
          type: 'store' as const,
          name: s.name,
          address: s.address,
          emoji: '🛒',
          photoUrl: (s as any).photoUrl ?? undefined,
          location: (s as any).location,
        }));
    } else if (cat === 'groomer') {
      const snap = await getDocs(query(collection(db, COLLECTIONS.GROOMERS), where('status', 'in', ['approved', 'pending'])));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((g) => g.status === 'approved' || isRecent(g))
        .map((g) => ({
          id: g.id,
          type: 'groomer' as const,
          name: g.businessName || g.name,
          address: g.address || g.city || '',
          emoji: '✂️',
          photoUrl: g.photoUrl,
          rating: g.rating,
          reviewCount: g.reviewCount,
          location: g.location,
        }));
    } else if (cat === 'walker') {
      const snap = await getDocs(query(collection(db, COLLECTIONS.WALKERS), where('status', 'in', ['approved', 'pending'])));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((w) => w.status === 'approved' || isRecent(w))
        .map((w) => ({
          id: w.id,
          type: 'walker' as const,
          name: w.name,
          address: w.city || '',
          emoji: '🦮',
          photoUrl: w.photoUrl,
          rating: w.rating,
          reviewCount: w.reviewCount,
          location: w.location,
        }));
    } else if (cat === 'trainer') {
      const snap = await getDocs(query(collection(db, COLLECTIONS.TRAINERS), where('status', 'in', ['approved', 'pending'])));
      list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((t) => t.status === 'approved' || isRecent(t))
        .map((t) => ({
          id: t.id,
          type: 'trainer' as const,
          name: t.name,
          address: t.city || '',
          emoji: '🎓',
          photoUrl: t.photoUrl,
          rating: t.rating,
          reviewCount: t.reviewCount,
          location: t.location,
        }));
    }

    const withDistance = list.map((it) => ({
      ...it,
      distanceKm: (coords && it.location) ? distanceKm(coords.lat, coords.lng, it.location.lat, it.location.lng) : undefined,
    }));

    function byDistanceThenRating(a: GuestItem, b: GuestItem) {
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

  useFocusEffect(useCallback(() => { setLoading(true); loadData().catch(() => {}).finally(() => setLoading(false)); }, [cat]));

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
                    key={`${it.type}-${it.id}`}
                    onPress={() => router.push(`/(guest)/profile/${it.type}/${it.id}` as any)}
                    style={{
                      backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16,
                      flexDirection: 'row', alignItems: 'center', gap: 14,
                      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
                      borderWidth: 1, borderColor: '#F1F5F9',
                      opacity: showNoAvailability ? 0.75 : 1,
                    }}
                  >
                    {it.photoUrl ? (
                      <Image source={{ uri: it.photoUrl }} style={{ width: 64, height: 64, borderRadius: 16 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 30 }}>{it.emoji}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, marginBottom: 2 }}>{it.name}</Text>
                      <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 4 }}>{it.address}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {it.distanceKm != null && (
                          <View style={{ backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#1D4ED8', fontWeight: '700' }}>📍 {formatDistance(it.distanceKm)}</Text>
                          </View>
                        )}
                        {it.is24_7 && (
                          <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>🚨 24/7</Text>
                          </View>
                        )}
                        {showNoAvailability && (
                          <View style={{ backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '700' }}>🗓️ Sin agenda</Text>
                          </View>
                        )}
                        {it.rating != null && (
                          <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>⭐ {it.rating.toFixed(1)}</Text>
                        )}
                      </View>
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
