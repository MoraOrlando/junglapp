import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../context/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { initFirebase, handleEmailAlreadyInUse } from '@junglapp/firebase';
import * as Location from 'expo-location';

const { db } = initFirebase();

const schema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  rut: z.string().min(8, 'RUT inválido'),
  storeName: z.string().min(2, 'Nombre de tienda requerido'),
  storeDescription: z.string().min(10, 'Descripción requerida'),
  phone: z.string().min(9, 'Teléfono inválido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  address: z.string().min(5, 'Dirección requerida'),
  region: z.string().min(2, 'Región requerida'),
  city: z.string().min(2, 'Ciudad / Comuna requerida'),
});
type FormData = z.infer<typeof schema>;

const AMBER = '#D97706';
const AMBER_LIGHT = '#FEF3C7';

export default function RegisterStoreScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function captureLocation() {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Activa la ubicación para que los clientes te encuentren cerca.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert('Error', 'No se pudo obtener la ubicación. Puedes continuar sin ella.');
    } finally {
      setGettingLocation(false);
    }
  }

  async function onSubmit(data: FormData) {
    if (!termsAccepted) {
      Alert.alert('Requerido', 'Debes aceptar los términos de uso para continuar.');
      return;
    }
    setLoading(true);
    try {
      const { firebaseUser } = await signUp(data.email, data.password, {
        role: 'store',
        name: data.name,
        rut: data.rut,
        phone: data.phone,
        email: data.email,
        address: data.address,
        region: data.region,
        city: data.city,
      }) as any;

      const uid = firebaseUser?.uid;
      if (uid) {
        await setDoc(doc(db, 'stores', uid), {
          userId: uid,
          rut: data.rut,
          name: data.storeName,
          description: data.storeDescription,
          address: data.address,
          phone: data.phone,
          email: data.email,
          ...(location ? { location } : {}),
          status: 'pending',
          categories: [],
          services: [],
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        await handleEmailAlreadyInUse(data.email);
        Alert.alert('Correo en uso', '¿Olvidaste tu contraseña? Puedes recuperarla desde la pantalla de inicio.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  const fields: Array<{
    name: keyof FormData; label: string; placeholder: string;
    keyboard?: any; secure?: boolean; multiline?: boolean;
  }> = [
    { name: 'name', label: 'Tu nombre completo', placeholder: 'Juan Pérez' },
    { name: 'rut', label: 'RUT del responsable', placeholder: '12.345.678-9' },
    { name: 'storeName', label: 'Nombre de la tienda', placeholder: 'PetShop Mascotitas' },
    { name: 'storeDescription', label: 'Descripción de la tienda', placeholder: 'Vendemos productos premium para mascotas...', multiline: true },
    { name: 'phone', label: 'Teléfono', placeholder: '+56 9 1234 5678', keyboard: 'phone-pad' },
    { name: 'email', label: 'Correo electrónico', placeholder: 'tienda@ejemplo.com', keyboard: 'email-address' },
    { name: 'password', label: 'Contraseña', placeholder: '••••••••', secure: true },
    { name: 'address', label: 'Dirección de la tienda', placeholder: 'Av. Comercial 456' },
    { name: 'region', label: 'Región', placeholder: 'Metropolitana' },
    { name: 'city', label: 'Ciudad / Comuna', placeholder: 'Providencia' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 24 }}>
            <Text style={{ color: AMBER, fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: AMBER }}>🏪 Tienda Pet Shop</Text>
            <Text style={{ color: '#6B7280', marginTop: 4 }}>Tu tienda será revisada antes de activarse</Text>
          </View>

          <View style={{ gap: 16 }}>
            {fields.map((f) => (
              <View key={f.name}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 }}>{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      style={{
                        borderWidth: 1, borderColor: errors[f.name] ? '#EF4444' : '#E5E7EB',
                        borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
                        backgroundColor: '#fff', fontSize: 15,
                        ...(f.multiline ? { minHeight: 80, textAlignVertical: 'top' } : {}),
                      }}
                      placeholder={f.placeholder}
                      keyboardType={f.keyboard || 'default'}
                      autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'words'}
                      secureTextEntry={f.secure}
                      multiline={f.multiline}
                      numberOfLines={f.multiline ? 3 : 1}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors[f.name] && (
                  <Text style={{ color: '#EF4444', fontSize: 11, marginTop: 3 }}>{errors[f.name]?.message}</Text>
                )}
              </View>
            ))}
          </View>

          {/* Geolocalización */}
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 8 }}>
              📍 Ubicación de la tienda
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 10 }}>
              Permite que los clientes cercanos puedan encontrar tu tienda.
            </Text>
            <TouchableOpacity
              onPress={captureLocation}
              disabled={gettingLocation}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: location ? '#10B981' : AMBER,
                borderRadius: 12, paddingVertical: 12, gap: 8,
                backgroundColor: location ? '#ECFDF5' : AMBER_LIGHT,
              }}
            >
              {gettingLocation
                ? <ActivityIndicator size="small" color={AMBER} />
                : <Text style={{ fontSize: 15 }}>{location ? '✅' : '📍'}</Text>
              }
              <Text style={{ color: location ? '#059669' : AMBER, fontWeight: '600' }}>
                {gettingLocation ? 'Obteniendo ubicación...'
                  : location ? `Ubicación capturada (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`
                    : 'Capturar ubicación actual'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Términos */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 24 }}
            onPress={() => setTermsAccepted(!termsAccepted)}
            activeOpacity={0.7}
          >
            <View style={{
              width: 20, height: 20, borderRadius: 4, borderWidth: 2, marginTop: 2,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: termsAccepted ? AMBER : '#fff',
              borderColor: termsAccepted ? AMBER : '#D1D5DB',
            }}>
              {termsAccepted && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: '#6B7280' }}>
              He leído y acepto los{' '}
              <Text style={{ color: AMBER, fontWeight: '600' }}>Términos y Condiciones de Uso</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              backgroundColor: AMBER, borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', marginTop: 16, marginBottom: 40,
              opacity: loading ? 0.7 : 1,
            }}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {loading ? 'Enviando solicitud...' : 'Enviar Solicitud'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
