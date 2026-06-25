import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput, Platform, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { LostPet } from '@junglapp/types';

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

const SCREEN_WIDTH = Dimensions.get('window').width;
const BANNER_WIDTH = SCREEN_WIDTH - 48;

export default function LostPetsPublicScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [lostPets, setLostPets] = useState<LostPet[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerRef = useRef<ScrollView>(null);

  async function load() {
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.LOST_PETS), where('isFound', '==', false))
      );
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as LostPet))
        .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
      setLostPets(data);
    } catch {}
  }

  useEffect(() => { load().catch(() => {}); }, []);

  // User location → map centers on their surroundings
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {}
    })();
  }, []);

  // Banner with lost pet photos — auto-advances every 3 seconds
  const bannerPets = lostPets.filter((lp) => lp.petPhotos?.[0]);
  useEffect(() => {
    if (bannerPets.length < 2) return;
    const t = setInterval(() => {
      setBannerIndex((i) => {
        const next = (i + 1) % bannerPets.length;
        bannerRef.current?.scrollTo({ x: next * BANNER_WIDTH, animated: true });
        return next;
      });
    }, 3000);
    return () => clearInterval(t);
  }, [bannerPets.length]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = lostPets.filter((lp) => {
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      lp.petName?.toLowerCase().includes(lower) ||
      lp.lastSeenLocation?.toLowerCase().includes(lower) ||
      lp.state?.toLowerCase().includes(lower)
    );
  });

  const myReports = lostPets.filter((lp) => lp.ownerId === user?.uid);
  const petsWithCoords = lostPets.filter((lp) => lp.lat != null && lp.lng != null);

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-red-500 px-6 pb-6 pt-4 rounded-b-3xl">
        <TouchableOpacity onPress={() => router.replace('/(owner)' as any)} className="mb-3">
          <Text className="text-white text-base">← Volver</Text>
        </TouchableOpacity>
        <Text className="text-white text-2xl font-bold">🔍 Mascotas Extraviadas</Text>
        <Text className="text-white/70 text-sm mt-1">{filtered.length} publicaciones activas</Text>

        <View className="flex-row items-center bg-white/20 rounded-xl px-3 mt-4">
          <Text className="text-white/70 mr-2">🔍</Text>
          <TextInput
            className="flex-1 py-3 text-white"
            placeholder="Buscar por nombre, lugar..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EF4444" />}
      >
        {/* My reports banner */}
        {myReports.length > 0 && (
          <View className="mx-6 mt-4 bg-orange-50 border border-orange-200 rounded-2xl p-3 flex-row items-center gap-2">
            <Text className="text-xl">🚨</Text>
            <View className="flex-1">
              <Text className="text-orange-700 font-semibold text-sm">
                Tienes {myReports.length} mascota{myReports.length > 1 ? 's' : ''} reportada{myReports.length > 1 ? 's' : ''}
              </Text>
              <Text className="text-orange-500 text-xs">Recibirás un chat cuando alguien las encuentre</Text>
            </View>
          </View>
        )}

        {/* Map: user location + nearby lost pets */}
        {MapView && userCoords ? (
          <View className="mx-6 mt-4 rounded-2xl overflow-hidden border border-gray-200" style={{ height: 220 }}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{
                latitude: userCoords.latitude,
                longitude: userCoords.longitude,
                latitudeDelta: 0.06,
                longitudeDelta: 0.06,
              }}
              showsUserLocation
            >
              {petsWithCoords.map((lp) => (
                <Marker
                  key={lp.id}
                  coordinate={{ latitude: lp.lat!, longitude: lp.lng! }}
                  title={lp.petName || 'Mascota extraviada'}
                  description={lp.lastSeenLocation}
                  onCalloutPress={() => router.push(`/(owner)/lost/${lp.id}` as any)}
                />
              ))}
            </MapView>
            <View style={{ position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, color: '#374151', fontWeight: '600' }}>
                📍 {petsWithCoords.length} extraviada{petsWithCoords.length !== 1 ? 's' : ''} cerca de ti
              </Text>
            </View>
          </View>
        ) : Platform.OS !== 'web' && MapView ? (
          <View className="mx-6 mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-4 items-center">
            <Text className="text-gray-400 text-sm">📍 Activa la ubicación para ver el mapa de mascotas cercanas</Text>
          </View>
        ) : null}

        {/* Rotating photo banner */}
        {bannerPets.length > 0 && (
          <View className="mt-4">
            <Text className="px-6 text-gray-700 font-semibold text-sm mb-2">📸 Ayúdanos a encontrarlas</Text>
            <ScrollView
              ref={bannerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: 24 }}
              onMomentumScrollEnd={(e) => setBannerIndex(Math.round(e.nativeEvent.contentOffset.x / BANNER_WIDTH))}
            >
              {bannerPets.map((lp) => (
                <TouchableOpacity
                  key={lp.id}
                  activeOpacity={0.9}
                  onPress={() => router.push(`/(owner)/lost/${lp.id}` as any)}
                  style={{ width: BANNER_WIDTH, height: 170, borderRadius: 18, overflow: 'hidden' }}
                >
                  <Image source={{ uri: lp.petPhotos[0] }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: 10 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{lp.petName}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>📍 {lp.lastSeenLocation} · {lp.lastSeenDate}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Dots */}
            {bannerPets.length > 1 && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                {bannerPets.map((_, i) => (
                  <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === bannerIndex ? '#EF4444' : '#E5E7EB' }} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* List */}
        <View className="px-6 mt-4">
          {filtered.length === 0 ? (
            <View className="items-center py-16">
              <Text className="text-5xl mb-3">🎉</Text>
              <Text className="text-gray-600 font-medium">No hay mascotas extraviadas en esta zona</Text>
              <Text className="text-gray-400 text-sm mt-1 text-center">¡Qué buena noticia! Si ves una mascota perdida, ayúdanos a reportarla.</Text>
            </View>
          ) : (
            <View className="gap-4 pb-6">
              {filtered.map((lp) => {
                const isOwner = lp.ownerId === user?.uid;
                return (
                  <TouchableOpacity
                    key={lp.id}
                    className={`rounded-2xl overflow-hidden shadow-sm border ${isOwner ? 'border-orange-200' : 'border-gray-100'}`}
                    onPress={() => router.push(`/(owner)/lost/${lp.id}` as any)}
                  >
                    {/* Photo area */}
                    <View className="bg-red-100 items-center justify-center relative" style={{ height: 150 }}>
                      {lp.petPhotos?.[0] ? (
                        <Image source={{ uri: lp.petPhotos[0] }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : (
                        <Text className="text-7xl">{lp.petSpecies === 'cat' ? '🐈' : '🐕'}</Text>
                      )}
                      {isOwner && (
                        <View className="absolute top-2 right-2 bg-orange-500 rounded-full px-2 py-0.5">
                          <Text className="text-white text-xs font-bold">Mi mascota</Text>
                        </View>
                      )}
                    </View>

                    <View className="bg-white p-4">
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1">
                          <Text className="font-bold text-gray-800 text-lg">{lp.petName || 'Sin nombre'}</Text>
                          <Text className="text-gray-500 text-sm">{lp.petBreed} · {lp.petColor}</Text>
                        </View>
                        <View className="bg-red-100 rounded-xl px-2 py-1">
                          <Text className="text-red-600 text-xs font-medium">🔍 Extraviada</Text>
                        </View>
                      </View>

                      <View className="mt-2 gap-1">
                        <Text className="text-gray-500 text-sm">📍 {lp.lastSeenLocation}</Text>
                        <Text className="text-gray-400 text-xs">📅 Visto por última vez: {lp.lastSeenDate}</Text>
                      </View>

                      {lp.description && (
                        <Text className="text-gray-500 text-sm mt-2" numberOfLines={2}>{lp.description}</Text>
                      )}

                      {!isOwner && (
                        <View className="mt-3 bg-primary-50 rounded-xl px-4 py-2.5 items-center">
                          <Text className="text-primary-600 font-semibold text-sm">¿La encontraste? Toca aquí →</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
