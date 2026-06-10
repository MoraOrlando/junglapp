import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Veterinarian, ClinicService } from '@junglapp/types';

const CLINIC_SERVICES: { id: ClinicService; label: string }[] = [
  { id: 'veterinaria', label: '🩺 Veterinaria' },
  { id: 'peluqueria', label: '✂️ Peluquería' },
  { id: 'rayos_x', label: '🩻 Rayos X' },
  { id: 'intervenciones', label: '🔬 Intervenciones' },
];

const { db } = initFirebase();
const GREEN = '#2D6A4F';

export default function VetProfileScreen() {
  const { user, logOut } = useAuth();
  const [vet, setVet] = useState<Veterinarian | null>(null);
  const [vetDocId, setVetDocId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [specialtyInput, setSpecialtyInput] = useState('');
  const [fee, setFee] = useState('');
  const [is24_7, setIs24_7] = useState(false);
  const [openingHours, setOpeningHours] = useState('');
  const [clinicServices, setClinicServices] = useState<ClinicService[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, COLLECTIONS.VETERINARIANS), where('userId', '==', user.uid))).then((snap) => {
      if (!snap.empty) {
        const v = { id: snap.docs[0].id, ...snap.docs[0].data() } as Veterinarian;
        setVet(v);
        setVetDocId(snap.docs[0].id);
        setName(v.name || '');
        setPhone(v.phone || '');
        setAddress(v.address || '');
        setLicenseNumber(v.licenseNumber || '');
        setFee(String(v.consultationFee ?? ''));
        setSpecialtyInput((v.specialties || []).join(', '));
        setIs24_7(!!v.is24_7);
        setOpeningHours(v.openingHours || '');
        setClinicServices(v.clinicServices || []);
      } else {
        setLoadError(true);
      }
    }).catch(() => setLoadError(true));
  }, [user]);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && vetDocId) {
      setUploadingPhoto(true);
      try {
        const url = await uploadImage(result.assets[0].uri);
        await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vetDocId), { photoUrl: url });
        setVet((prev) => prev ? { ...prev, photoUrl: url } : prev);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setUploadingPhoto(false);
      }
    }
  }

  async function save() {
    if (!vetDocId) return;
    setSaving(true);
    try {
      const specialties = specialtyInput.split(',').map((s) => s.trim()).filter(Boolean);
      const numFee = Number(fee) || 0;
      await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vetDocId), {
        name, phone, address, licenseNumber, specialties, consultationFee: numFee,
        is24_7, openingHours, clinicServices,
      });
      Alert.alert('✅', 'Perfil actualizado correctamente');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!vet) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        {loadError ? (
          <>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
            <Text style={{ color: '#374151', fontWeight: '600', textAlign: 'center' }}>No se encontró tu perfil veterinario.</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8, textAlign: 'center' }}>Contacta a soporte si el problema persiste.</Text>
          </>
        ) : (
          <ActivityIndicator color={GREEN} />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: GREEN, marginTop: 20, marginBottom: 20 }}>Mi Perfil 🩺</Text>

        {/* Avatar */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={pickPhoto} disabled={uploadingPhoto}>
            {vet.photoUrl ? (
              <Image source={{ uri: vet.photoUrl }} style={{ width: 90, height: 90, borderRadius: 45 }} contentFit="cover" />
            ) : (
              <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 40 }}>🩺</Text>
              </View>
            )}
            <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: GREEN, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              {uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 12 }}>📷</Text>}
            </View>
          </TouchableOpacity>
          <Text style={{ marginTop: 8, fontWeight: '700', fontSize: 16, color: '#1F2937' }}>{vet.name}</Text>
          {(vet.rating ?? 0) > 0 && (
            <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>⭐ {vet.rating?.toFixed(1)} · {vet.reviewCount} reseñas</Text>
          )}
        </View>

        {/* Editable fields */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, marginBottom: 14 }}>Información personal</Text>
          {[
            { label: 'Nombre', value: name, set: setName },
            { label: 'Teléfono', value: phone, set: setPhone, keyboard: 'phone-pad' },
            { label: 'Dirección de consulta', value: address, set: setAddress },
            { label: 'Nº Registro Profesional', value: licenseNumber, set: setLicenseNumber },
            { label: 'Tarifa de consulta (CLP)', value: fee, set: setFee, keyboard: 'number-pad' },
          ].map((f) => (
            <View key={f.label} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4, fontWeight: '500' }}>{f.label}</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', fontSize: 14 }}
                value={f.value}
                onChangeText={f.set}
                keyboardType={(f as any).keyboard || 'default'}
              />
            </View>
          ))}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4, fontWeight: '500' }}>Especialidades (separadas por coma)</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', fontSize: 14 }}
              value={specialtyInput}
              onChangeText={setSpecialtyInput}
              placeholder="Cirugía, Dermatología, Cardiología..."
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Clinic / emergency services */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, marginBottom: 4 }}>Atención y servicios 🏥</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 14 }}>
            Esta información se muestra a los dueños en "Cerca de ti" para que ubiquen atención de urgencia.
          </Text>

          {/* 24/7 toggle */}
          <TouchableOpacity
            onPress={() => setIs24_7((v) => !v)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              borderWidth: 1, borderColor: is24_7 ? '#FCA5A5' : '#E5E7EB', borderRadius: 12,
              paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
              backgroundColor: is24_7 ? '#FEF2F2' : '#F9FAFB',
            }}
          >
            <Text style={{ fontWeight: '600', fontSize: 14, color: is24_7 ? '#DC2626' : '#374151' }}>🚨 Urgencias 24/7</Text>
            <Text style={{ fontSize: 18 }}>{is24_7 ? '✅' : '⬜'}</Text>
          </TouchableOpacity>

          {/* Opening hours (when not 24/7) */}
          {!is24_7 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4, fontWeight: '500' }}>Horario de atención</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', fontSize: 14 }}
                value={openingHours}
                onChangeText={setOpeningHours}
                placeholder="Lun-Vie 9:00-19:00, Sáb 10:00-14:00"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          )}

          {/* Services offered */}
          <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 8, fontWeight: '500' }}>Servicios ofrecidos</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CLINIC_SERVICES.map((s) => {
              const active = clinicServices.includes(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setClinicServices((prev) => active ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                  style={{
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                    borderWidth: 1, borderColor: active ? GREEN : '#E5E7EB',
                    backgroundColor: active ? '#ECFDF5' : '#F9FAFB',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: active ? GREEN : '#6B7280' }}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Read-only info */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, marginBottom: 10 }}>Datos registrados</Text>
          {[
            { label: 'RUT', value: vet.rut },
            { label: 'Correo', value: vet.email },
          ].map((item) => (
            <View key={item.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>{item.label}</Text>
              <Text style={{ color: '#374151', fontSize: 13, fontWeight: '500' }}>{item.value}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={save} disabled={saving} style={{ backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12, opacity: saving ? 0.7 : 1 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={logOut} style={{ borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 40, backgroundColor: '#FEF2F2' }}>
          <Text style={{ color: '#EF4444', fontWeight: '700' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
