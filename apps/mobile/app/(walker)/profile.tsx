import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, ActionSheetIOS,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Walker } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#2D6A4F';

const REGIONS = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

function fieldStyle() {
  return {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 16, height: 50, fontSize: 15, color: '#1F2937', backgroundColor: '#fff',
  } as const;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
      <Text style={{ color: '#6B7280', fontSize: 13, width: 110 }}>{label}</Text>
      <Text style={{ color: '#1E293B', fontSize: 13, fontWeight: '500', flex: 1 }}>{value || '—'}</Text>
    </View>
  );
}

export default function WalkerProfileScreen() {
  const { user, logOut, deleteAccount, updateProfile } = useAuth();
  const router = useRouter();
  const [walker, setWalker] = useState<Walker | null>(null);
  const [walkFee, setWalkFee] = useState('');
  const [careFee, setCareFee] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('Metropolitana');
  const [experience, setExperience] = useState('');
  const [maxDogs, setMaxDogs] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, COLLECTIONS.WALKERS, user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setWalker({ ...data, id: snap.id } as Walker);
        setWalkFee(data.walkFee != null ? String(data.walkFee) : '');
        setCareFee(data.careFee != null ? String(data.careFee) : '');
        setName(data.name ?? '');
        setAddress(data.address ?? '');
        setCity(data.city ?? '');
        setRegion(data.region ?? 'Metropolitana');
        setExperience(data.experience != null ? String(data.experience) : '');
        setMaxDogs(data.maxDogs != null ? String(data.maxDogs) : '');
        if (data.location) setLocation(data.location);
      }
    }).catch(() => {});
  }, [user?.uid]);

  function openRegionPicker() {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...REGIONS, 'Cancelar'], cancelButtonIndex: REGIONS.length },
      (buttonIndex) => { if (buttonIndex < REGIONS.length) setRegion(REGIONS[buttonIndex]); }
    );
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (!result.canceled && user) {
      setUploadingPhoto(true);
      try {
        const url = await uploadImage(result.assets[0].uri);
        await updateDoc(doc(db, COLLECTIONS.WALKERS, user.uid), { photoUrl: url });
        setWalker((prev) => prev ? { ...prev, photoUrl: url } : prev);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setUploadingPhoto(false);
      }
    }
  }

  function confirmDeletePhoto() {
    Alert.alert('Eliminar foto', '¿Quitar tu foto de perfil?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          if (!user) return;
          setUploadingPhoto(true);
          try {
            await updateDoc(doc(db, COLLECTIONS.WALKERS, user.uid), { photoUrl: null });
            setWalker((prev) => prev ? { ...prev, photoUrl: null } : prev);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setUploadingPhoto(false);
          }
        },
      },
    ]);
  }

  async function captureLocation() {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Activa la ubicación en ajustes.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert('Error', 'No se pudo obtener la ubicación.');
    } finally {
      setGettingLocation(false);
    }
  }

  async function save() {
    if (!user) return;
    const walkNum = walkFee ? Number(walkFee) : null;
    const careNum = careFee ? Number(careFee) : null;
    if (walkFee && (isNaN(walkNum!) || walkNum! < 0)) {
      Alert.alert('Error', 'Ingresa un valor válido para el paseo');
      return;
    }
    if (careFee && (isNaN(careNum!) || careNum! < 0)) {
      Alert.alert('Error', 'Ingresa un valor válido para el cuidado');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Error', 'El nombre no puede estar vacío');
      return;
    }
    if (!city.trim()) {
      Alert.alert('Error', 'La ciudad no puede estar vacía');
      return;
    }
    const expNum = Number(experience);
    const maxDogsNum = Number(maxDogs);
    if (!experience || isNaN(expNum) || expNum < 0) {
      Alert.alert('Error', 'Ingresa un valor válido para experiencia');
      return;
    }
    if (!maxDogs || isNaN(maxDogsNum) || maxDogsNum < 1) {
      Alert.alert('Error', 'Ingresa un valor válido para máx. perros');
      return;
    }
    setSaving(true);
    try {
      const updates: any = {
        walkFee: walkNum,
        careFee: careNum,
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        region,
        experience: expNum,
        maxDogs: maxDogsNum,
        updatedAt: new Date().toISOString(),
      };
      if (location) updates.location = location;
      await updateDoc(doc(db, COLLECTIONS.WALKERS, user.uid), updates);
      // Keep users/{uid}.name in sync — that's what AuthContext.user.name
      // reads from (e.g. the home screen greeting), separate from the
      // walkers/{uid} doc other screens read for display.
      if (name.trim() !== user.name) {
        await updateProfile({ name: name.trim() });
      }
      setWalker((prev) => prev ? { ...prev, ...updates } : prev);
      Alert.alert('¡Guardado!', 'Tu perfil fue actualizado.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F0FDF4' }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 20 }}>
          <Text style={{ color: '#16a34a', fontSize: 16 }}>← Volver</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 22, fontWeight: '800', color: '#14532D', marginBottom: 20 }}>Mi perfil</Text>

        {user?.accountStatus === 'under_review' && (
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 16, borderWidth: 1, borderColor: '#FDE68A', padding: 14, marginBottom: 16 }}>
            <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>⚠️ Cuenta en revisión</Text>
            <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
              Un administrador está evaluando un reporte sobre tu cuenta.
            </Text>
          </View>
        )}

        {/* Avatar */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={pickPhoto} disabled={uploadingPhoto}>
            {walker?.photoUrl ? (
              <Image source={{ uri: walker.photoUrl }} style={{ width: 90, height: 90, borderRadius: 45 }} contentFit="cover" />
            ) : (
              <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 40 }}>🦮</Text>
              </View>
            )}
            <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: GREEN, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              {uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 12 }}>📷</Text>}
            </View>
          </TouchableOpacity>
          {walker?.photoUrl && !uploadingPhoto && (
            <TouchableOpacity onPress={confirmDeletePhoto} style={{ marginTop: 8 }}>
              <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>Eliminar foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Info card */}
        {walker && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, marginBottom: 12 }}>Datos personales</Text>

            <InfoRow label="Email" value={walker.email} />
            <InfoRow label="Teléfono" value={walker.phone} />
            <InfoRow label="Tamaños" value={walker.sizesAccepted?.join(', ') || 'Todos'} />
            {walker.rating != null && (
              <InfoRow
                label="Calificación"
                value={`⭐ ${Number(walker.rating).toFixed(1)} / 5 (${walker.reviewCount ?? 0} reseñas)`}
              />
            )}

            <View style={{ marginTop: 16 }}>
              <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginBottom: 6 }}>Nombre</Text>
              <TextInput style={fieldStyle()} value={name} onChangeText={setName} placeholder="Tu nombre" placeholderTextColor="#9CA3AF" />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginBottom: 6 }}>Dirección</Text>
              <TextInput style={fieldStyle()} value={address} onChangeText={setAddress} placeholder="Ej: Los Aromos 123" placeholderTextColor="#9CA3AF" />
            </View>

            <TouchableOpacity
              onPress={captureLocation}
              disabled={gettingLocation}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                borderRadius: 12, paddingVertical: 12, marginTop: 12,
                borderWidth: 1, borderColor: location ? '#10B981' : GREEN,
                backgroundColor: location ? '#ECFDF5' : '#F0FDF4',
              }}
            >
              {gettingLocation ? <ActivityIndicator size="small" color={GREEN} /> : <Text>📍</Text>}
              <Text style={{ color: location ? '#059669' : GREEN, fontWeight: '600', fontSize: 14 }}>
                {gettingLocation ? 'Obteniendo ubicación...' : location ? 'Actualizar ubicación' : 'Capturar ubicación'}
              </Text>
            </TouchableOpacity>
            {location && (
              <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 6, textAlign: 'center' }}>
                ✅ Ubicación guardada — se usa para calcular la distancia en "Cerca de ti"
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginBottom: 6 }}>Ciudad</Text>
                <TextInput style={fieldStyle()} value={city} onChangeText={setCity} placeholder="Tu ciudad" placeholderTextColor="#9CA3AF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginBottom: 6 }}>Región</Text>
                <TouchableOpacity style={[fieldStyle(), { justifyContent: 'center' }]} onPress={openRegionPicker}>
                  <Text style={{ fontSize: 15, color: '#1F2937' }} numberOfLines={1}>{region}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginBottom: 6 }}>Experiencia (años)</Text>
                <TextInput style={fieldStyle()} value={experience} onChangeText={setExperience} keyboardType="number-pad" placeholder="Ej: 3" placeholderTextColor="#9CA3AF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginBottom: 6 }}>Máx. perros</Text>
                <TextInput style={fieldStyle()} value={maxDogs} onChangeText={setMaxDogs} keyboardType="number-pad" placeholder="Ej: 3" placeholderTextColor="#9CA3AF" />
              </View>
            </View>
          </View>
        )}

        {/* Pricing card */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, marginBottom: 16 }}>Mis tarifas</Text>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginBottom: 6 }}>
              Valor paseo (por salida, en CLP)
            </Text>
            <TextInput
              style={{
                borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
                paddingHorizontal: 16, height: 50, fontSize: 16, color: '#1F2937', backgroundColor: '#fff',
              }}
              placeholder="Ej: 8000"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              value={walkFee}
              onChangeText={setWalkFee}
            />
          </View>

          <View>
            <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginBottom: 6 }}>
              Valor cuidado / hospedaje (por día, en CLP)
            </Text>
            <TextInput
              style={{
                borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
                paddingHorizontal: 16, height: 50, fontSize: 16, color: '#1F2937', backgroundColor: '#fff',
              }}
              placeholder="Ej: 20000"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              value={careFee}
              onChangeText={setCareFee}
            />
          </View>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: '#2D6A4F', borderRadius: 16, paddingVertical: 14,
            alignItems: 'center', opacity: saving ? 0.7 : 1, marginBottom: 12,
          }}
          onPress={save}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Guardar cambios</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 12, backgroundColor: '#FEE2E2' }}
          onPress={() => Alert.alert('Cerrar sesión', '¿Seguro que deseas salir?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: () => logOut() },
          ])}
        >
          <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 15 }}>Cerrar sesión</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 40, backgroundColor: '#F3F4F6' }}
          onPress={() => Alert.alert(
            'Eliminar cuenta',
            'Esta acción es irreversible. Se eliminarán todos tus datos permanentemente. ¿Estás seguro?',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await deleteAccount(); } catch (e: any) { Alert.alert('Error', e.message); } } },
            ]
          )}
        >
          <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 15 }}>Eliminar cuenta</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
