import { useState, useEffect } from 'react';
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
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [region, setRegion] = useState('Metropolitana');
  const [regionOpen, setRegionOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function captureLocation() {
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
  }

  async function onSubmit(data: FormData) {
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
      Alert.alert('Error', e.message);
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
                    <TextInput
                      className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                      placeholder={f.placeholder}
                      keyboardType={f.keyboard || 'default'}
                      autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'words'}
                      secureTextEntry={f.secure}
                      onChangeText={onChange}
                      value={value}
                    />
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

          <TouchableOpacity
            className={`bg-primary-500 rounded-2xl py-4 items-center mt-6 mb-10 ${loading ? 'opacity-70' : ''}`}
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
