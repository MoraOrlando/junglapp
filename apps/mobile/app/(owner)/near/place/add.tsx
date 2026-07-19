import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, addDoc, limit } from 'firebase/firestore';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../../../context/AuthContext';
import { distanceKm } from '../../../../lib/distance';
import { locationKeys } from '../../../../lib/locationKey';
import { logPlaceAdded, logPlaceDuplicateDetected } from '../../../../lib/analytics';
import type { Place, PlaceCategory } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#0E7490';

const CATEGORIES: { id: PlaceCategory; label: string; emoji: string }[] = [
  { id: 'park', label: 'Parque para perros', emoji: '🐕' },
  { id: 'restaurant', label: 'Restaurante pet-friendly', emoji: '🍽️' },
];

// A new place within this radius of an existing one, in the same category,
// is treated as a likely duplicate.
const DUPLICATE_RADIUS_KM = 0.15;

export default function AddPlaceScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [category, setCategory] = useState<PlaceCategory>('park');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: 'images' });
    if (result.canceled || !result.assets[0]) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(result.assets[0].uri);
      setPhotoUrl(url);
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function captureLocation(): Promise<{ loc: { lat: number; lng: number }; regionKey: string | null } | null> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ubicación requerida', 'Activa el permiso de ubicación para agregar un lugar — se usa tu posición actual.');
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    // Reverse-geocode the place's actual location — not the owner's saved
    // address — so it's findable by other users near it even if the owner
    // is adding it while traveling.
    let regionKey: string | null = null;
    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.lat, longitude: loc.lng });
      if (geo?.region) regionKey = locationKeys(geo.city, geo.region).regionKey;
    } catch {}
    return { loc, regionKey };
  }

  async function findNearbyDuplicates(loc: { lat: number; lng: number }, placeRegionKey: string | null): Promise<Place[]> {
    const constraints = [where('category', '==', category)];
    if (placeRegionKey) constraints.push(where('regionKey', '==', placeRegionKey));
    const snap = await getDocs(query(collection(db, COLLECTIONS.PLACES), ...constraints, limit(200)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Place))
      .filter((p) => distanceKm(loc.lat, loc.lng, p.location.lat, p.location.lng) <= DUPLICATE_RADIUS_KM);
  }

  async function createPlace(loc: { lat: number; lng: number }, placeRegionKey: string | null) {
    if (!user) return;
    setSaving(true);
    try {
      const newPlace: Omit<Place, 'id'> = {
        name: name.trim(),
        category,
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        location: loc,
        ...(placeRegionKey ? { regionKey: placeRegionKey } : {}),
        createdBy: user.uid,
        createdByName: user.name || 'Usuario',
        rating: 0,
        reviewCount: 0,
        createdAt: new Date().toISOString(),
      };
      const ref = await addDoc(collection(db, COLLECTIONS.PLACES), newPlace);
      logPlaceAdded(category);
      router.replace(`/(owner)/near/place/${ref.id}` as any);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!name.trim()) { Alert.alert('Falta información', 'Ponle un nombre al lugar.'); return; }
    setCheckingDuplicates(true);
    try {
      const captured = await captureLocation();
      if (!captured) return;
      const { loc, regionKey: placeRegionKey } = captured;

      const duplicates = await findNearbyDuplicates(loc, placeRegionKey);
      if (duplicates.length > 0) {
        logPlaceDuplicateDetected(category);
        Alert.alert(
          'Ya existe un lugar cerca',
          `Encontramos "${duplicates[0].name}" muy cerca de tu ubicación. ¿Es el mismo lugar?`,
          [
            { text: 'Es otro lugar, continuar', onPress: () => createPlace(loc, placeRegionKey) },
            { text: 'Ver el lugar existente', onPress: () => router.replace(`/(owner)/near/place/${duplicates[0].id}` as any) },
            { text: 'Cancelar', style: 'cancel' },
          ]
        );
        return;
      }
      await createPlace(loc, placeRegionKey);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCheckingDuplicates(false);
    }
  }

  const busy = saving || checkingDuplicates || uploadingPhoto;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={{ fontSize: 22, color: GREEN }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '800', color: GREEN }}>+ Agregar lugar</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>
            Usaremos tu ubicación actual como la del lugar — asegúrate de estar ahí al agregarlo.
          </Text>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Categoría</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setCategory(c.id)}
                style={{
                  flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                  borderWidth: 2, borderColor: category === c.id ? GREEN : '#E2E8F0',
                  backgroundColor: category === c.id ? '#ECFEFF' : '#fff',
                }}
              >
                <Text style={{ fontSize: 24, marginBottom: 4 }}>{c.emoji}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: category === c.id ? GREEN : '#64748B', textAlign: 'center' }}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Foto (opcional)</Text>
          <TouchableOpacity
            onPress={pickPhoto}
            disabled={uploadingPhoto}
            style={{
              width: '100%', height: 160, borderRadius: 14, marginBottom: 18,
              borderWidth: 1, borderColor: '#E5E7EB', borderStyle: photoUrl ? 'solid' : 'dashed',
              backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}
          >
            {uploadingPhoto ? (
              <ActivityIndicator color={GREEN} />
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <>
                <Text style={{ fontSize: 28, marginBottom: 6 }}>📷</Text>
                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>Toca para agregar una foto</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Nombre</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ej: Parque Bustamante"
            placeholderTextColor="#9CA3AF"
            style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937', marginBottom: 16 }}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Dirección (opcional)</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Ej: Av. Bustamante 123"
            placeholderTextColor="#9CA3AF"
            style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937', marginBottom: 16 }}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Descripción (opcional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="¿Qué lo hace bueno para tu mascota?"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff', color: '#1F2937', minHeight: 80, textAlignVertical: 'top', marginBottom: 24 }}
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={busy}
            style={{ backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Agregar lugar</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
