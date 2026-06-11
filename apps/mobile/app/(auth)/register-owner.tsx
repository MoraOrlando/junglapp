import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { handleEmailAlreadyInUse } from '@junglapp/firebase';

const REGIONS = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

const schema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  rut: z.string().min(8, 'RUT inválido'),
  phone: z.string().min(9, 'Teléfono inválido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  address: z.string().min(5, 'Dirección requerida'),
  city: z.string().min(2, 'Ciudad requerida'),
});
type FormData = z.infer<typeof schema>;

export default function RegisterOwnerScreen() {
  const router = useRouter();
  const { signUp, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'microsoft' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [region, setRegion] = useState('Metropolitana');
  const [regionOpen, setRegionOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function captureLocation() {
    Alert.alert(
      '📍 Acceso a tu ubicación',
      'JunglApp usará tu ubicación para mostrarte servicios y tiendas cercanas. ¿Deseas permitir el acceso?',
      [
        { text: 'No por ahora', style: 'cancel' },
        {
          text: 'Permitir',
          onPress: async () => {
            setLocating(true);
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'No podremos geolocalizarte automáticamente, pero puedes continuar.');
                return;
              }
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            } catch {
              Alert.alert('Error', 'No se pudo obtener tu ubicación.');
            } finally {
              setLocating(false);
            }
          },
        },
      ]
    );
  }

  async function handleGoogle() {
    if (!termsAccepted) { Alert.alert('Requerido', 'Debes aceptar los términos de uso para continuar.'); return; }
    setSocialLoading('google');
    try { await signInWithGoogle(); } catch (e: any) { Alert.alert('Error', e.message); } finally { setSocialLoading(null); }
  }

  async function handleMicrosoft() {
    if (!termsAccepted) { Alert.alert('Requerido', 'Debes aceptar los términos de uso para continuar.'); return; }
    setSocialLoading('microsoft');
    try { await signInWithMicrosoft(); } catch (e: any) { Alert.alert('Error', e.message); } finally { setSocialLoading(null); }
  }

  async function onSubmit(data: FormData) {
    if (!termsAccepted) { Alert.alert('Requerido', 'Debes aceptar los términos de uso para continuar.'); return; }
    setLoading(true);
    try {
      await signUp(data.email, data.password, {
        role: 'owner',
        name: data.name,
        rut: data.rut,
        phone: data.phone,
        email: data.email,
        address: data.address,
        region,
        city: data.city,
        ...(coords ? { location: coords } : {}),
      });
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        await handleEmailAlreadyInUse(data.email);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  const fields: Array<{ name: keyof FormData; label: string; placeholder: string; keyboard?: any; secure?: boolean }> = [
    { name: 'name', label: 'Nombre completo', placeholder: 'Juan Pérez' },
    { name: 'rut', label: 'RUT', placeholder: '12.345.678-9' },
    { name: 'phone', label: 'Teléfono', placeholder: '+56 9 1234 5678', keyboard: 'phone-pad' },
    { name: 'email', label: 'Correo electrónico', placeholder: 'correo@ejemplo.com', keyboard: 'email-address' },
    { name: 'password', label: 'Contraseña', placeholder: '••••••••', secure: true },
    { name: 'address', label: 'Dirección', placeholder: 'Av. Principal 123' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="px-6">
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-6">
            <Text className="text-primary-500 text-base">← Volver</Text>
          </TouchableOpacity>

          <View className="mb-6">
            <Text className="text-3xl font-bold text-primary-700">👨‍👩‍👧 Dueño de Mascota</Text>
            <Text className="text-gray-500 mt-2">Completa tu perfil de Family Lover</Text>
          </View>

          <View className="gap-4">
            {fields.map((f) => (
              <View key={f.name}>
                <Text className="text-sm font-medium text-gray-700 mb-1">{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, value } }) => (
                    f.secure ? (
                      <View style={{ position: 'relative' }}>
                        <TextInput
                          className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                          style={{ paddingRight: 48 }}
                          placeholder={f.placeholder}
                          secureTextEntry={!showPassword}
                          onChangeText={onChange}
                          value={value}
                        />
                        <TouchableOpacity
                          onPress={() => setShowPassword((v) => !v)}
                          style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                        >
                          <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TextInput
                        className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                        placeholder={f.placeholder}
                        keyboardType={f.keyboard || 'default'}
                        autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'words'}
                        onChangeText={onChange}
                        value={value}
                      />
                    )
                  )}
                />
                {errors[f.name] && (
                  <Text className="text-red-500 text-xs mt-1">{errors[f.name]?.message}</Text>
                )}
              </View>
            ))}

            {/* Region picker */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Región</Text>
              <TouchableOpacity
                className="border border-gray-200 rounded-xl px-4 py-3 bg-white flex-row justify-between items-center"
                onPress={() => setRegionOpen(!regionOpen)}
              >
                <Text className="text-base text-gray-800">{region}</Text>
                <Text className="text-gray-400">{regionOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {regionOpen && (
                <View className="border border-gray-200 rounded-xl mt-1 bg-white max-h-60">
                  <ScrollView nestedScrollEnabled>
                    {REGIONS.map((r) => (
                      <TouchableOpacity
                        key={r}
                        className={`px-4 py-3 border-b border-gray-50 ${region === r ? 'bg-green-50' : ''}`}
                        onPress={() => { setRegion(r); setRegionOpen(false); }}
                      >
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
                    className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                    placeholder="Providencia"
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              {errors.city && <Text className="text-red-500 text-xs mt-1">{errors.city.message}</Text>}
            </View>

            {/* Geolocation */}
            <TouchableOpacity
              className={`rounded-xl py-3 items-center border ${coords ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}
              onPress={captureLocation}
              disabled={locating}
            >
              <Text className={coords ? 'text-green-700 font-medium' : 'text-primary-600 font-medium'}>
                {locating ? 'Obteniendo ubicación...' : coords ? '✓ Ubicación capturada 📍' : '📍 Usar mi ubicación actual'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Terms acceptance */}
          <TouchableOpacity
            className="flex-row items-start gap-3 mt-6"
            onPress={() => setTermsAccepted(!termsAccepted)}
            activeOpacity={0.7}
          >
            <View className={`w-5 h-5 rounded border-2 mt-0.5 items-center justify-center ${termsAccepted ? 'bg-primary-500 border-primary-500' : 'border-gray-300 bg-white'}`}>
              {termsAccepted && <Text className="text-white text-xs font-bold">✓</Text>}
            </View>
            <Text className="flex-1 text-sm text-gray-600">
              He leído y acepto los{' '}
              <Text className="text-primary-500 font-semibold" onPress={() => router.push('/(auth)/terms')}>
                Términos y Condiciones de Uso
              </Text>
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View className="flex-row items-center my-4">
            <View className="flex-1 h-px bg-gray-200" />
            <Text className="mx-4 text-gray-400 text-sm">o regístrate con</Text>
            <View className="flex-1 h-px bg-gray-200" />
          </View>

          {/* Social buttons */}
          <View className="gap-3 mb-4">
            <TouchableOpacity
              className="flex-row items-center justify-center border border-gray-200 rounded-2xl py-3 bg-white gap-2"
              onPress={handleGoogle}
              disabled={socialLoading !== null}
            >
              <Text className="text-lg">🔴</Text>
              <Text className="font-semibold text-gray-700">
                {socialLoading === 'google' ? 'Conectando...' : 'Continuar con Google'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center justify-center border border-gray-200 rounded-2xl py-3 bg-white gap-2"
              onPress={handleMicrosoft}
              disabled={socialLoading !== null}
            >
              <Text className="text-lg">🔷</Text>
              <Text className="font-semibold text-gray-700">
                {socialLoading === 'microsoft' ? 'Conectando...' : 'Continuar con Microsoft'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className={`bg-primary-500 rounded-2xl py-4 items-center mb-10 ${loading ? 'opacity-70' : ''}`}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            <Text className="text-white font-semibold text-base">
              {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
