import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { initFirebase, uploadImage } from '@junglapp/firebase';

const { db } = initFirebase();

const REGIONS = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

const SERVICES = [
  { id: 'bath', label: '🛁 Baño y secado' },
  { id: 'haircut', label: '✂️ Corte de pelo' },
  { id: 'nails', label: '💅 Corte de uñas' },
  { id: 'ears', label: '👂 Limpieza de oídos' },
  { id: 'teeth', label: '🦷 Limpieza dental' },
  { id: 'full', label: '⭐ Peluquería completa' },
];

const schema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  rut: z.string().min(8, 'RUT inválido'),
  businessName: z.string().min(2, 'Nombre del negocio requerido'),
  phone: z.string().min(9, 'Teléfono inválido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  city: z.string().min(2, 'Ciudad requerida'),
  address: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const inputStyle = {
  height: 52,
  paddingHorizontal: 16,
  fontSize: 16,
  color: '#1F2937',
  textAlignVertical: 'center' as const,
};

export default function RegisterGroomingScreen() {
  const router = useRouter();
  const { signUp, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileUri, setProfileUri] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<'home' | 'store'>('store');
  const [region, setRegion] = useState('Metropolitana');
  const [regionOpen, setRegionOpen] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  function toggleService(id: string) {
    setSelectedServices((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }

  async function pickProfile() {
    Alert.alert('Foto de perfil', '¿Cómo agregar la foto?', [
      { text: 'Cámara', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled) setProfileUri(result.assets[0].uri);
      }},
      { text: 'Galería', onPress: async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
        if (!result.canceled) setProfileUri(result.assets[0].uri);
      }},
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function onSubmit(data: FormData) {
    if (selectedServices.length === 0) { Alert.alert('Requerido', 'Selecciona al menos un servicio.'); return; }
    if (!termsAccepted) { Alert.alert('Requerido', 'Debes aceptar los términos de uso para continuar.'); return; }
    setLoading(true);
    try {
      await signUp(data.email, data.password, {
        role: 'grooming',
        name: data.name,
        rut: data.rut,
        phone: data.phone,
        email: data.email,
        address: data.address || '',
        region,
        city: data.city,
      });

      if (firebaseUser) {
        const photoUrl = profileUri ? await uploadImage(profileUri) : null;
        await setDoc(doc(db, 'groomers', firebaseUser.uid), {
          userId: firebaseUser.uid,
          name: data.name,
          businessName: data.businessName,
          rut: data.rut,
          phone: data.phone,
          email: data.email,
          serviceType,
          address: serviceType === 'store' ? (data.address || '') : null,
          region,
          city: data.city,
          services: selectedServices,
          photoUrl,
          status: 'pending',
          availability: {},
          rating: null,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="px-6">
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-6">
            <Text className="text-primary-500 text-base">← Volver</Text>
          </TouchableOpacity>

          <View className="mb-6">
            <Text className="text-3xl font-bold text-primary-700">✂️ Peluquería</Text>
            <Text className="text-gray-500 mt-2">Tu cuenta será revisada antes de activarse</Text>
          </View>

          {/* Profile photo */}
          <View className="items-center mb-6">
            <TouchableOpacity onPress={pickProfile} activeOpacity={0.8}>
              {profileUri ? (
                <Image source={{ uri: profileUri }} style={{ width: 100, height: 100, borderRadius: 50 }} contentFit="cover" />
              ) : (
                <View className="w-24 h-24 rounded-full bg-purple-100 border-2 border-dashed border-purple-300 items-center justify-center">
                  <Text className="text-3xl">✂️</Text>
                </View>
              )}
              <View className="absolute bottom-0 right-0 bg-primary-500 rounded-full w-8 h-8 items-center justify-center">
                <Text className="text-white text-sm">📷</Text>
              </View>
            </TouchableOpacity>
            <Text className="text-gray-400 text-xs mt-2">Foto de perfil (recomendada)</Text>
          </View>

          {/* Service type selector */}
          <View className="mb-5">
            <Text className="text-sm font-medium text-gray-700 mb-2">Tipo de servicio</Text>
            <View className="flex-row gap-3">
              {[
                { id: 'store' as const, emoji: '🏪', label: 'Tienda física' },
                { id: 'home' as const, emoji: '🏠', label: 'A domicilio' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.id}
                  className={`flex-1 rounded-2xl py-4 items-center border-2 ${serviceType === t.id ? 'bg-purple-50 border-purple-400' : 'bg-white border-gray-200'}`}
                  onPress={() => setServiceType(t.id)}
                >
                  <Text className="text-3xl mb-1">{t.emoji}</Text>
                  <Text className={`text-sm font-semibold ${serviceType === t.id ? 'text-purple-700' : 'text-gray-500'}`}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="gap-4">
            {[
              { name: 'name' as const, label: 'Tu nombre completo', placeholder: 'María González' },
              { name: 'rut' as const, label: 'RUT', placeholder: '12.345.678-9' },
              { name: 'businessName' as const, label: 'Nombre del negocio', placeholder: 'PetLook Peluquería' },
              { name: 'phone' as const, label: 'Teléfono', placeholder: '+56 9 1234 5678', keyboard: 'phone-pad' },
              { name: 'email' as const, label: 'Correo electrónico', placeholder: 'peluqueria@ejemplo.com', keyboard: 'email-address' },
              { name: 'password' as const, label: 'Contraseña', placeholder: '••••••••', secure: true },
              ...(serviceType === 'store' ? [{ name: 'address' as const, label: 'Dirección de la tienda', placeholder: 'Av. Comercial 456' }] : []),
            ].map((f) => (
              <View key={f.name}>
                <Text className="text-sm font-medium text-gray-700 mb-1">{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      className="border border-gray-200 rounded-xl bg-white"
                      style={inputStyle}
                      placeholder={f.placeholder}
                      placeholderTextColor="#9CA3AF"
                      keyboardType={(f as any).keyboard || 'default'}
                      autoCapitalize={(f as any).keyboard === 'email-address' ? 'none' : 'words'}
                      secureTextEntry={(f as any).secure}
                      onChangeText={onChange}
                      value={value || ''}
                    />
                  )}
                />
                {errors[f.name] && <Text className="text-red-500 text-xs mt-1">{errors[f.name]?.message}</Text>}
              </View>
            ))}

            {/* Region */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Región</Text>
              <TouchableOpacity
                className="border border-gray-200 rounded-xl bg-white flex-row justify-between items-center px-4"
                style={{ height: 52 }}
                onPress={() => setRegionOpen(!regionOpen)}
              >
                <Text className="text-base text-gray-800">{region}</Text>
                <Text className="text-gray-400">{regionOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {regionOpen && (
                <View className="border border-gray-200 rounded-xl mt-1 bg-white max-h-48">
                  <ScrollView nestedScrollEnabled>
                    {REGIONS.map((r) => (
                      <TouchableOpacity key={r} className={`px-4 py-3 border-b border-gray-50 ${region === r ? 'bg-green-50' : ''}`} onPress={() => { setRegion(r); setRegionOpen(false); }}>
                        <Text className={region === r ? 'text-primary-700 font-medium' : 'text-gray-700'}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* City */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Ciudad / Comuna</Text>
              <Controller
                control={control}
                name="city"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    className="border border-gray-200 rounded-xl bg-white"
                    style={inputStyle}
                    placeholder="Providencia"
                    placeholderTextColor="#9CA3AF"
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              {errors.city && <Text className="text-red-500 text-xs mt-1">{errors.city.message}</Text>}
            </View>

            {/* Services offered */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-2">Servicios que ofreces *</Text>
              <View className="flex-row flex-wrap gap-2">
                {SERVICES.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => toggleService(s.id)}
                    className={`rounded-full px-4 py-2 border ${selectedServices.includes(s.id) ? 'bg-purple-500 border-purple-500' : 'bg-white border-gray-200'}`}
                  >
                    <Text className={`text-sm font-medium ${selectedServices.includes(s.id) ? 'text-white' : 'text-gray-600'}`}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Terms */}
          <TouchableOpacity className="flex-row items-start gap-3 mt-6" onPress={() => setTermsAccepted(!termsAccepted)} activeOpacity={0.7}>
            <View className={`w-5 h-5 rounded border-2 mt-0.5 items-center justify-center ${termsAccepted ? 'bg-primary-500 border-primary-500' : 'border-gray-300 bg-white'}`}>
              {termsAccepted && <Text className="text-white text-xs font-bold">✓</Text>}
            </View>
            <Text className="flex-1 text-sm text-gray-600">
              He leído y acepto los{' '}
              <Text className="text-primary-500 font-semibold" onPress={() => router.push('/(auth)/terms')}>Términos y Condiciones de Uso</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`bg-primary-500 rounded-2xl py-4 items-center mt-4 mb-10 ${loading ? 'opacity-70' : ''}`}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            <Text className="text-white font-semibold text-base">
              {loading ? 'Enviando solicitud...' : 'Enviar Solicitud'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
