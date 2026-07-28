import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Groomer, GroomingService } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#9333EA';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
      <Text style={{ color: '#6B7280', fontSize: 13, width: 110 }}>{label}</Text>
      <Text style={{ color: '#1E293B', fontSize: 13, fontWeight: '500', flex: 1 }}>{value || '—'}</Text>
    </View>
  );
}

export default function GroomingProfileScreen() {
  const { user, logOut, deleteAccount } = useAuth();
  const router = useRouter();
  const [groomer, setGroomer] = useState<Groomer | null>(null);
  const [fee, setFee] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [serviceOfferings, setServiceOfferings] = useState<GroomingService[]>([]);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, COLLECTIONS.GROOMERS, user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGroomer({ ...data, id: snap.id } as Groomer);
        setFee(data.fee != null ? String(data.fee) : '');
        setServiceOfferings(data.serviceOfferings || []);
        if (data.location) setLocation(data.location);
      }
    }).catch(() => {});
  }, [user?.uid]);

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

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (!result.canceled && user) {
      setUploadingPhoto(true);
      try {
        const url = await uploadImage(result.assets[0].uri);
        await updateDoc(doc(db, COLLECTIONS.GROOMERS, user.uid), { photoUrl: url });
        setGroomer((prev) => prev ? { ...prev, photoUrl: url } : prev);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setUploadingPhoto(false);
      }
    }
  }

  function confirmDeletePhoto() {
    Alert.alert('Eliminar foto', '¿Quitar la foto de perfil de tu negocio?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          if (!user) return;
          setUploadingPhoto(true);
          try {
            await updateDoc(doc(db, COLLECTIONS.GROOMERS, user.uid), { photoUrl: null });
            setGroomer((prev) => prev ? { ...prev, photoUrl: null } : prev);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setUploadingPhoto(false);
          }
        },
      },
    ]);
  }

  function addService() {
    const name = newServiceName.trim();
    const price = Number(newServicePrice);
    if (!name) { Alert.alert('Requerido', 'Ingresa el nombre del servicio'); return; }
    if (!newServicePrice || isNaN(price) || price < 0) { Alert.alert('Requerido', 'Ingresa un valor válido'); return; }
    setServiceOfferings((prev) => [...prev, { id: `${Date.now()}`, name, price }]);
    setNewServiceName('');
    setNewServicePrice('');
  }

  function removeService(id: string) {
    setServiceOfferings((prev) => prev.filter((s) => s.id !== id));
  }

  async function save() {
    if (!user) return;
    const feeNum = fee ? Number(fee) : null;
    if (fee && (isNaN(feeNum!) || feeNum! < 0)) {
      Alert.alert('Error', 'Ingresa un valor válido');
      return;
    }
    setSaving(true);
    try {
      const updates: any = {
        fee: feeNum,
        serviceOfferings,
        updatedAt: new Date().toISOString(),
      };
      if (location) updates.location = location;
      await updateDoc(doc(db, COLLECTIONS.GROOMERS, user.uid), updates);
      setGroomer((prev) => prev ? { ...prev, fee: feeNum, serviceOfferings, ...(location ? { location } : {}) } : prev);
      Alert.alert('¡Guardado!', 'Tu tarifa y servicios fueron actualizados.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF5FF' }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 20 }}>
          <Text style={{ color: PURPLE, fontSize: 16 }}>← Volver</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 22, fontWeight: '800', color: '#581C87', marginBottom: 20 }}>Mi perfil</Text>

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
            {groomer?.photoUrl ? (
              <Image source={{ uri: groomer.photoUrl }} style={{ width: 90, height: 90, borderRadius: 45 }} contentFit="cover" />
            ) : (
              <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 40 }}>✂️</Text>
              </View>
            )}
            <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: PURPLE, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              {uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 12 }}>📷</Text>}
            </View>
          </TouchableOpacity>
          {groomer?.photoUrl && !uploadingPhoto && (
            <TouchableOpacity onPress={confirmDeletePhoto} style={{ marginTop: 8 }}>
              <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '600' }}>Eliminar foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Info card */}
        {groomer && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, marginBottom: 12 }}>Datos personales</Text>
            <InfoRow label="Nombre" value={groomer.name} />
            <InfoRow label="Negocio" value={groomer.businessName || '—'} />
            <InfoRow label="Email" value={groomer.email} />
            <InfoRow label="Teléfono" value={groomer.phone} />
            <InfoRow label="Ciudad" value={`${groomer.city}, ${groomer.region}`} />
            <InfoRow label="Modalidad" value={groomer.serviceType === 'home' ? 'A domicilio' : 'En tienda'} />
            <InfoRow label="Servicios" value={groomer.services?.join(', ') || '—'} />
            {groomer.rating != null && (
              <InfoRow
                label="Calificación"
                value={`⭐ ${Number(groomer.rating).toFixed(1)} / 5 (${groomer.reviewCount ?? 0} reseñas)`}
              />
            )}
            <TouchableOpacity
              onPress={captureLocation}
              disabled={gettingLocation}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                borderRadius: 12, paddingVertical: 12, marginTop: 12,
                borderWidth: 1, borderColor: location ? '#10B981' : PURPLE,
                backgroundColor: location ? '#ECFDF5' : '#FAF5FF',
              }}
            >
              {gettingLocation ? <ActivityIndicator size="small" color={PURPLE} /> : <Text>📍</Text>}
              <Text style={{ color: location ? '#059669' : PURPLE, fontWeight: '600', fontSize: 14 }}>
                {gettingLocation ? 'Obteniendo ubicación...' : location ? 'Actualizar ubicación' : 'Capturar ubicación'}
              </Text>
            </TouchableOpacity>
            {location && (
              <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 6, textAlign: 'center' }}>
                ✅ Ubicación guardada — se usa para calcular la distancia en "Cerca de ti"
              </Text>
            )}
          </View>
        )}

        {/* Services with pricing */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, marginBottom: 4 }}>Servicios y precios</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 14 }}>
            Los dueños de mascotas verán estos servicios con su precio al momento de agendar.
          </Text>

          {serviceOfferings.length === 0 ? (
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 14 }}>Aún no agregas servicios con precio.</Text>
          ) : (
            <View style={{ gap: 8, marginBottom: 14 }}>
              {serviceOfferings.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAF5FF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#1E293B', fontWeight: '600', fontSize: 14 }}>{s.name}</Text>
                    <Text style={{ color: PURPLE, fontWeight: '700', fontSize: 13 }}>${s.price.toLocaleString('es-CL')}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeService(s.id)} style={{ padding: 6 }}>
                    <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <TextInput
              style={{ flex: 1.4, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 14, color: '#1F2937', backgroundColor: '#fff' }}
              placeholder="Ej: Baño completo"
              placeholderTextColor="#9CA3AF"
              value={newServiceName}
              onChangeText={setNewServiceName}
            />
            <TextInput
              style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 14, color: '#1F2937', backgroundColor: '#fff' }}
              placeholder="Precio"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              value={newServicePrice}
              onChangeText={setNewServicePrice}
            />
          </View>
          <TouchableOpacity
            onPress={addService}
            style={{ borderWidth: 1.5, borderColor: PURPLE, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
          >
            <Text style={{ color: PURPLE, fontWeight: '700', fontSize: 13 }}>+ Agregar servicio</Text>
          </TouchableOpacity>
        </View>

        {/* Pricing card (fallback flat fee) */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, marginBottom: 4 }}>Valor referencial "desde"</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 12 }}>
            Se muestra cuando no hay servicios con precio definidos arriba.
          </Text>

          <View>
            <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500', marginBottom: 6 }}>
              Valor desde (CLP)
            </Text>
            <TextInput
              style={{
                borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
                paddingHorizontal: 16, height: 50, fontSize: 16, color: '#1F2937', backgroundColor: '#fff',
              }}
              placeholder="Ej: 15000"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              value={fee}
              onChangeText={setFee}
            />
          </View>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: PURPLE, borderRadius: 16, paddingVertical: 14,
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
          style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 12, backgroundColor: '#fff' }}
          onPress={() => router.push('/(auth)/change-password' as any)}
        >
          <Text style={{ color: '#374151', fontWeight: '700', fontSize: 15 }}>🔑 Cambiar contraseña</Text>
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
