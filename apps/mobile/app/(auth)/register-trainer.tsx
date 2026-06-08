import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { doc, setDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage, handleEmailAlreadyInUse } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

const { db } = initFirebase();
const INDIGO = '#4F46E5';
const SPECIALTIES = ['Obediencia básica', 'Obediencia avanzada', 'Agility', 'Comportamiento', 'Cachorros', 'Socialización', 'Terapia', 'Búsqueda y rescate'];

export default function RegisterTrainerScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [idImage, setIdImage] = useState<string | null>(null);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);

  const [form, setForm] = useState({
    name: '', rut: '', phone: '', email: '', password: '',
    address: '', region: '', city: '',
    experience: '', serviceArea: '', consultationFee: '', certifications: '',
  });

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSpecialty(s: string) {
    setSelectedSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function pickIdImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled) setIdImage(result.assets[0].uri);
  }

  async function onSubmit() {
    if (!form.name || !form.rut || !form.email || !form.password || !form.phone || !form.address) {
      Alert.alert('Campos requeridos', 'Completa todos los campos obligatorios.');
      return;
    }
    if (!idImage) {
      Alert.alert('Documento requerido', 'Debes subir una foto de tu cédula o documento de identidad.');
      return;
    }
    if (!termsAccepted) {
      Alert.alert('Requerido', 'Debes aceptar los términos de uso.');
      return;
    }
    setLoading(true);
    try {
      const { firebaseUser } = await signUp(form.email, form.password, {
        role: 'trainer',
        name: form.name,
        rut: form.rut,
        phone: form.phone,
        email: form.email,
        address: form.address,
        region: form.region,
        city: form.city,
      }) as any;

      const uid = firebaseUser?.uid;
      if (uid) {
        const idImageUrl = await uploadImage(idImage);
        await setDoc(doc(db, COLLECTIONS.TRAINERS, uid), {
          userId: uid,
          name: form.name,
          rut: form.rut,
          phone: form.phone,
          email: form.email,
          address: form.address,
          region: form.region,
          city: form.city,
          idImageUrl,
          experience: form.experience,
          serviceArea: form.serviceArea,
          consultationFee: Number(form.consultationFee) || 0,
          certifications: form.certifications.split(',').map((c) => c.trim()).filter(Boolean),
          specialties: selectedSpecialties,
          status: 'pending',
          rating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        await handleEmailAlreadyInUse(form.email);
        Alert.alert('Correo en uso', 'Ya existe una cuenta con este correo.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  const fields: Array<{ key: keyof typeof form; label: string; placeholder: string; keyboard?: any; secure?: boolean; multiline?: boolean; required?: boolean }> = [
    { key: 'name', label: 'Nombre completo *', placeholder: 'Juan Pérez', required: true },
    { key: 'rut', label: 'RUT *', placeholder: '12.345.678-9', required: true },
    { key: 'phone', label: 'Teléfono *', placeholder: '+56 9 1234 5678', keyboard: 'phone-pad', required: true },
    { key: 'email', label: 'Correo electrónico *', placeholder: 'adiestrador@ejemplo.com', keyboard: 'email-address', required: true },
    { key: 'password', label: 'Contraseña *', placeholder: '••••••••', secure: true, required: true },
    { key: 'address', label: 'Dirección *', placeholder: 'Av. Principal 123', required: true },
    { key: 'region', label: 'Región', placeholder: 'Metropolitana' },
    { key: 'city', label: 'Ciudad / Comuna', placeholder: 'Santiago' },
    { key: 'serviceArea', label: 'Área de servicio', placeholder: 'Providencia, Las Condes, Vitacura...' },
    { key: 'experience', label: 'Años de experiencia', placeholder: 'ej: 5 años trabajando con perros de raza...', multiline: true },
    { key: 'certifications', label: 'Certificaciones (separadas por coma)', placeholder: 'Certificado CCPDT, Diplomado Etología...' },
    { key: 'consultationFee', label: 'Valor por sesión (CLP)', placeholder: '25000', keyboard: 'number-pad' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 20 }}>
            <Text style={{ color: INDIGO, fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: INDIGO }}>🐕 Adiestrador</Text>
            <Text style={{ color: '#6B7280', marginTop: 4 }}>Tu perfil será revisado antes de activarse</Text>
          </View>

          {/* Campos principales */}
          <View style={{ gap: 14 }}>
            {fields.map((f) => (
              <View key={f.key}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 }}>{f.label}</Text>
                <TextInput
                  style={{
                    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
                    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', fontSize: 15,
                    ...(f.multiline ? { minHeight: 72, textAlignVertical: 'top' } : {}),
                  }}
                  placeholder={f.placeholder}
                  keyboardType={f.keyboard || 'default'}
                  autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'words'}
                  secureTextEntry={f.secure}
                  multiline={f.multiline}
                  value={form[f.key]}
                  onChangeText={(v) => setField(f.key, v)}
                />
              </View>
            ))}
          </View>

          {/* Especialidades */}
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 10 }}>Especialidades</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SPECIALTIES.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => toggleSpecialty(s)}
                  style={{
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1,
                    backgroundColor: selectedSpecialties.includes(s) ? INDIGO : '#fff',
                    borderColor: selectedSpecialties.includes(s) ? INDIGO : '#E5E7EB',
                  }}
                >
                  <Text style={{ fontSize: 13, color: selectedSpecialties.includes(s) ? '#fff' : '#6B7280', fontWeight: selectedSpecialties.includes(s) ? '600' : '400' }}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Foto cédula/DNI */}
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
              📄 Cédula / Documento de identidad *
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 10 }}>
              Sube una foto clara de tu cédula o DNI para validar tu identidad.
            </Text>
            <TouchableOpacity
              onPress={pickIdImage}
              style={{
                borderWidth: 2, borderStyle: 'dashed',
                borderColor: idImage ? '#4F46E5' : '#D1D5DB',
                borderRadius: 14, overflow: 'hidden',
                backgroundColor: idImage ? '#EEF2FF' : '#F9FAFB',
                minHeight: 140, alignItems: 'center', justifyContent: 'center',
              }}
            >
              {idImage ? (
                <Image source={{ uri: idImage }} style={{ width: '100%', height: 160 }} contentFit="cover" />
              ) : (
                <View style={{ alignItems: 'center', padding: 24 }}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>🪪</Text>
                  <Text style={{ color: INDIGO, fontWeight: '600', fontSize: 14 }}>Toca para subir foto</Text>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                    Cédula de identidad, pasaporte o DNI
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {idImage && (
              <TouchableOpacity onPress={pickIdImage} style={{ marginTop: 8, alignItems: 'center' }}>
                <Text style={{ color: INDIGO, fontSize: 13, fontWeight: '600' }}>Cambiar imagen</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Términos */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 24 }}
            onPress={() => setTermsAccepted(!termsAccepted)}
          >
            <View style={{
              width: 20, height: 20, borderRadius: 4, borderWidth: 2, marginTop: 2,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: termsAccepted ? INDIGO : '#fff',
              borderColor: termsAccepted ? INDIGO : '#D1D5DB',
            }}>
              {termsAccepted && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: '#6B7280' }}>
              He leído y acepto los{' '}
              <Text style={{ color: INDIGO, fontWeight: '600' }}>Términos y Condiciones de Uso</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onSubmit}
            disabled={loading}
            style={{
              backgroundColor: INDIGO, borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', marginTop: 16, marginBottom: 40,
              flexDirection: 'row', justifyContent: 'center', gap: 8,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading && <ActivityIndicator size="small" color="#fff" />}
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {loading ? 'Enviando solicitud...' : 'Enviar Solicitud'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
