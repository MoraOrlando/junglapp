import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import { PlanCard } from '../../components/PlanCard';
import type { Trainer } from '@junglapp/types';

const { db } = initFirebase();
const INDIGO = '#4F46E5';

export default function TrainerProfileScreen() {
  const { user, logOut, deleteAccount } = useAuth();
  const router = useRouter();
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [experience, setExperience] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [backgroundCheckUrl, setBackgroundCheckUrl] = useState<string | null>(null);
  const [uploadingBgCheck, setUploadingBgCheck] = useState(false);
  const [serviceInstructions, setServiceInstructions] = useState('');

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, COLLECTIONS.TRAINERS), where('userId', '==', user.uid))).then((snap) => {
      if (!snap.empty) {
        const t = { id: snap.docs[0].id, ...snap.docs[0].data() } as Trainer;
        setTrainer(t);
        setDocId(snap.docs[0].id);
        setName(t.name);
        setPhone(t.phone);
        setAddress(t.address);
        setExperience(t.experience || '');
        setServiceArea(t.serviceArea || '');
        if (t.location) setLocation(t.location);
        setBackgroundCheckUrl(t.backgroundCheckUrl ?? null);
        setServiceInstructions(t.serviceInstructions ?? '');
      }
    });
  }, [user]);

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
    if (!result.canceled && docId) {
      setUploadingPhoto(true);
      try {
        const url = await uploadImage(result.assets[0].uri);
        await updateDoc(doc(db, COLLECTIONS.TRAINERS, docId), { photoUrl: url });
        setTrainer((prev) => prev ? { ...prev, photoUrl: url } : prev);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setUploadingPhoto(false);
      }
    }
  }

  async function pickBackgroundCheck() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (!result.canceled && docId) {
      setUploadingBgCheck(true);
      try {
        const url = await uploadImage(result.assets[0].uri);
        // Reviewed by support alongside the ID card during account approval —
        // no separate status field, they just see the link is now present.
        await updateDoc(doc(db, COLLECTIONS.TRAINERS, docId), { backgroundCheckUrl: url });
        setBackgroundCheckUrl(url);
        Alert.alert('✅ Certificado cargado', 'Quedó registrado y será revisado por soporte.');
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setUploadingBgCheck(false);
      }
    }
  }

  async function save() {
    if (!docId) return;
    setSaving(true);
    try {
      const updates: any = { name, phone, address, experience, serviceArea, serviceInstructions: serviceInstructions.trim(), plan: 'free' };
      if (location) updates.location = location;
      await updateDoc(doc(db, COLLECTIONS.TRAINERS, docId), updates);
      Alert.alert('✅', 'Perfil actualizado correctamente');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!trainer) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={INDIGO} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: INDIGO, marginTop: 20, marginBottom: 20 }}>Mi Perfil 🐕</Text>

        {user?.accountStatus === 'under_review' && (
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 16, borderWidth: 1, borderColor: '#FDE68A', padding: 14, marginBottom: 16 }}>
            <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>⚠️ Cuenta en revisión</Text>
            <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
              Un administrador está evaluando un reporte sobre tu cuenta.
            </Text>
          </View>
        )}

        <View style={{ backgroundColor: backgroundCheckUrl ? '#ECFDF5' : '#EFF6FF', borderRadius: 16, borderWidth: 1, borderColor: backgroundCheckUrl ? '#A7F3D0' : '#BFDBFE', padding: 14, marginBottom: 16 }}>
          <Text style={{ color: backgroundCheckUrl ? '#059669' : '#1D4ED8', fontWeight: '700', fontSize: 13 }}>
            {backgroundCheckUrl ? '✅ Certificado de antecedentes cargado' : '📋 Falta tu certificado de antecedentes'}
          </Text>
          <Text style={{ color: backgroundCheckUrl ? '#059669' : '#1D4ED8', fontSize: 12, marginTop: 2, marginBottom: 10 }}>
            {backgroundCheckUrl ? 'En revisión por soporte.' : 'Súbelo para completar tu verificación. Puedes seguir usando la app mientras tanto.'}
          </Text>
          <TouchableOpacity
            onPress={pickBackgroundCheck}
            disabled={uploadingBgCheck}
            style={{ backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: backgroundCheckUrl ? '#A7F3D0' : '#BFDBFE' }}
          >
            {uploadingBgCheck
              ? <ActivityIndicator size="small" color={backgroundCheckUrl ? '#059669' : '#1D4ED8'} />
              : <Text style={{ color: backgroundCheckUrl ? '#059669' : '#1D4ED8', fontWeight: '600', fontSize: 13 }}>
                  {backgroundCheckUrl ? '📤 Reemplazar certificado' : '📤 Subir certificado de antecedentes'}
                </Text>}
          </TouchableOpacity>
        </View>

        {user && <PlanCard uid={user.uid} />}

        {/* Avatar */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={pickPhoto} disabled={uploadingPhoto}>
            {trainer.photoUrl ? (
              <Image source={{ uri: trainer.photoUrl }} style={{ width: 90, height: 90, borderRadius: 45 }} contentFit="cover" />
            ) : (
              <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 40 }}>🐕</Text>
              </View>
            )}
            <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: INDIGO, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              {uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 12 }}>📷</Text>}
            </View>
          </TouchableOpacity>
          <Text style={{ marginTop: 8, fontWeight: '700', fontSize: 16, color: '#1F2937' }}>{trainer.name}</Text>
          <View style={{
            borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4,
            backgroundColor: trainer.status === 'approved' ? '#ECFDF5' : trainer.status === 'pending' ? '#FFFBEB' : '#FEF2F2',
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: trainer.status === 'approved' ? '#059669' : trainer.status === 'pending' ? '#D97706' : '#EF4444' }}>
              {trainer.status === 'approved' ? '✅ Verificado' : trainer.status === 'pending' ? '⏳ En revisión' : '❌ Rechazado'}
            </Text>
          </View>
          {(trainer.rating ?? 0) > 0 && (
            <Text style={{ marginTop: 6, color: '#6B7280', fontSize: 13 }}>
              ⭐ {trainer.rating?.toFixed(1)} · {trainer.reviewCount} reseñas
            </Text>
          )}
        </View>

        {/* Fields */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, marginBottom: 14 }}>Información</Text>
          {[
            { label: 'Nombre', value: name, set: setName },
            { label: 'Teléfono', value: phone, set: setPhone, keyboard: 'phone-pad' },
            { label: 'Dirección', value: address, set: setAddress },
            { label: 'Área de servicio', value: serviceArea, set: setServiceArea },
            { label: 'Experiencia', value: experience, set: setExperience, multiline: true },
            { label: 'Indicaciones del servicio (el dueño las verá al agendar)', value: serviceInstructions, set: setServiceInstructions, multiline: true },
          ].map((f) => (
            <View key={f.label} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4, fontWeight: '500' }}>{f.label}</Text>
              <TextInput
                style={{
                  borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', fontSize: 14,
                  ...(f.multiline ? { minHeight: 72, textAlignVertical: 'top' } : {}),
                }}
                value={f.value}
                onChangeText={f.set}
                keyboardType={(f as any).keyboard || 'default'}
                multiline={(f as any).multiline}
              />
            </View>
          ))}
          <TouchableOpacity
            onPress={captureLocation}
            disabled={gettingLocation}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              borderRadius: 12, paddingVertical: 12,
              borderWidth: 1, borderColor: location ? '#10B981' : INDIGO,
              backgroundColor: location ? '#ECFDF5' : '#EEF2FF',
            }}
          >
            {gettingLocation ? <ActivityIndicator size="small" color={INDIGO} /> : <Text>📍</Text>}
            <Text style={{ color: location ? '#059669' : INDIGO, fontWeight: '600', fontSize: 14 }}>
              {gettingLocation ? 'Obteniendo ubicación...' : location ? 'Actualizar ubicación' : 'Capturar ubicación'}
            </Text>
          </TouchableOpacity>
          {location && (
            <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 6, textAlign: 'center' }}>
              ✅ Ubicación guardada — se usa para calcular la distancia en "Cerca de ti"
            </Text>
          )}
        </View>

        {/* Specialties */}
        {trainer.specialties?.length > 0 && (
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
            <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, marginBottom: 10 }}>Especialidades</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {trainer.specialties.map((s) => (
                <View key={s} style={{ backgroundColor: '#EEF2FF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: INDIGO, fontSize: 12, fontWeight: '600' }}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity onPress={save} disabled={saving} style={{ backgroundColor: INDIGO, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12, opacity: saving ? 0.7 : 1 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/(auth)/change-password' as any)}
          style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12, backgroundColor: '#fff' }}
        >
          <Text style={{ color: '#374151', fontWeight: '700' }}>🔑 Cambiar contraseña</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={logOut} style={{ borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12, backgroundColor: '#FEE2E2' }}>
          <Text style={{ color: '#DC2626', fontWeight: '700' }}>Cerrar sesión</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Alert.alert(
            'Eliminar cuenta',
            'Esta acción es irreversible. Se eliminarán todos tus datos permanentemente. ¿Estás seguro?',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await deleteAccount(); } catch (e: any) { Alert.alert('Error', e.message); } } },
            ]
          )}
          style={{ borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 40, backgroundColor: '#F3F4F6' }}
        >
          <Text style={{ color: '#6B7280', fontWeight: '700' }}>Eliminar cuenta</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
