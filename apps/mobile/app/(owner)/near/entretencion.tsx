import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { distanceKm } from '../../../lib/distance';
import { ownerFilterRegionKey } from '../../../lib/locationKey';
import { logNearCategoryViewed } from '../../../lib/analytics';
import type { Place, CommunityEvent } from '@junglapp/types';

const { db } = initFirebase();

// react-native-maps does not support web — load it only on native
let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
  } catch {}
}

const GREEN = '#0E7490';

const CATEGORY_META: Record<Place['category'], { label: string; emoji: string }> = {
  park: { label: 'Parque para perros', emoji: '🐕' },
  restaurant: { label: 'Restaurante pet-friendly', emoji: '🍽️' },
};

interface PlaceWithDistance extends Place {
  distanceKm?: number;
}

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function EntretencionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [places, setPlaces] = useState<PlaceWithDistance[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);

  async function loadEvents() {
    setEventsLoading(true);
    try {
      const filterRegionKey = ownerFilterRegionKey(user);
      const constraints = filterRegionKey ? [where('regionKey', '==', filterRegionKey)] : [];
      const snap = await getDocs(query(
        collection(db, COLLECTIONS.EVENTS),
        ...constraints,
        where('expiresAt', '>=', new Date().toISOString()),
        limit(100),
      ));
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityEvent));
      results.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
      setEvents(results);
    } catch {
      // Events are a secondary section — a failure here shouldn't block places from loading.
    } finally {
      setEventsLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    setLoadError(false);
    loadEvents();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocationDenied(true); setLoading(false); return; }
      setLocationDenied(false);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      setCoords({ latitude, longitude });

      const filterRegionKey = ownerFilterRegionKey(user);
      const constraints = filterRegionKey ? [where('regionKey', '==', filterRegionKey)] : [];
      const snap = await getDocs(query(collection(db, COLLECTIONS.PLACES), ...constraints, limit(200)));
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Place));
      const withDistance = results
        .map((p) => ({ ...p, distanceKm: distanceKm(latitude, longitude, p.location.lat, p.location.lng) }))
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
      setPlaces(withDistance);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { logNearCategoryViewed('entretencion'); load(); }, [user?.uid]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={{ fontSize: 22, color: GREEN }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: GREEN }}>🐾 Entretención</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(owner)/near/place/add' as any)}
          style={{ backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ Agregar lugar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Events don't need GPS, so this section renders regardless of the
            location-permission state that gates the places section below. */}
        <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B' }}>📅 Eventos cerca de ti</Text>
            <TouchableOpacity
              onPress={() => router.push('/(owner)/near/event/add' as any)}
              style={{ backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>+ Crear evento</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 14 }}>
            Vigentes hasta el día del evento · creados por la comunidad
          </Text>

          {eventsLoading ? (
            <ActivityIndicator color={GREEN} style={{ marginVertical: 16 }} />
          ) : events.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#F1F5F9' }}>
              <Text style={{ fontSize: 30, marginBottom: 6 }}>📅</Text>
              <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                Aún no hay eventos vigentes cerca de ti.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {events.map((ev) => (
                <TouchableOpacity
                  key={ev.id}
                  onPress={() => router.push(`/(owner)/near/event/${ev.id}` as any)}
                  style={{
                    backgroundColor: '#fff', borderRadius: 18, padding: 14,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    borderWidth: 1, borderColor: '#F1F5F9',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                  }}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#ECFEFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {ev.photoUrl ? (
                      <Image source={{ uri: ev.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : (
                      <Text style={{ fontSize: 24 }}>📅</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15 }} numberOfLines={1}>{ev.name}</Text>
                    <Text style={{ color: '#64748B', fontSize: 12, marginTop: 1 }} numberOfLines={1}>{ev.place}</Text>
                    <Text style={{ fontSize: 12, color: GREEN, fontWeight: '600', marginTop: 2 }}>
                      {new Date(ev.eventDate + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} · {ev.region}
                    </Text>
                  </View>
                  <Text style={{ color: '#CBD5E1', fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
            <ActivityIndicator color={GREEN} />
          </View>
        ) : locationDenied ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📍</Text>
            <Text style={{ color: '#64748B', fontSize: 15, textAlign: 'center' }}>
              Activa el permiso de ubicación para ver los lugares cercanos a ti.
            </Text>
          </View>
        ) : (
          <>
          {MapView && coords && (
            <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9', height: 240 }}>
              <MapView
                style={{ flex: 1 }}
                initialRegion={{ ...coords, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
                showsUserLocation
              >
                {places.map((p) => (
                  <Marker
                    key={p.id}
                    coordinate={{ latitude: p.location.lat, longitude: p.location.lng }}
                    title={p.name}
                    description={CATEGORY_META[p.category].label}
                    onCalloutPress={() => router.push(`/(owner)/near/place/${p.id}` as any)}
                  />
                ))}
              </MapView>
            </View>
          )}

          <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 4 }}>
              📍 Lugares cerca de ti
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 14 }}>
              Agregados por la comunidad · toca un lugar para ver reseñas
            </Text>

            {loadError ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ color: '#94A3B8', fontSize: 14 }}>No pudimos cargar los lugares. Intenta de nuevo.</Text>
                <TouchableOpacity onPress={load} style={{ marginTop: 12, backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : places.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ fontSize: 34, marginBottom: 8 }}>🐾</Text>
                <Text style={{ color: '#94A3B8', fontSize: 14, textAlign: 'center', marginBottom: 14 }}>
                  Nadie ha agregado lugares cerca de ti todavía.{'\n'}¡Sé el primero!
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/(owner)/near/place/add' as any)}
                  style={{ backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>+ Agregar lugar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {places.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push(`/(owner)/near/place/${p.id}` as any)}
                    style={{
                      backgroundColor: '#fff', borderRadius: 18, padding: 14,
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      borderWidth: 1, borderColor: '#F1F5F9',
                      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
                    }}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#ECFEFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {p.photoUrl ? (
                        <Image source={{ uri: p.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : (
                        <Text style={{ fontSize: 24 }}>{CATEGORY_META[p.category].emoji}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15 }}>{p.name}</Text>
                      <Text style={{ color: '#64748B', fontSize: 12, marginTop: 1 }}>
                        {CATEGORY_META[p.category].label}
                        {p.distanceKm != null ? ` · ${formatDistance(p.distanceKm)}` : ''}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600', marginTop: 2 }}>
                        {p.reviewCount > 0 ? `⭐ ${p.rating.toFixed(1)} (${p.reviewCount})` : 'Sin reseñas aún'}
                      </Text>
                    </View>
                    <Text style={{ color: '#CBD5E1', fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
