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
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { initFirebase, uploadImage } from '@junglapp/firebase';

const { db } = initFirebase();

const schema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  rut: z.string().min(8, 'RUT inválido'),
  phone: z.string().min(9, 'Teléfono inválido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  address: z.string().min(5, 'Dirección requerida'),
  region: z.string().min(2, 'Región requerida'),
  city: z.string().min(2, 'Ciudad requerida'),
  licenseNumber: z.string().min(3, 'Número de registro requerido'),
  consultationFee: z.string().min(1, 'Valor consulta requerido'),
});
type FormData = z.infer<typeof schema>;

export default function RegisterVetScreen() {
  const router = useRouter();
  const { signUp, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [credentialUri, setCredentialUri] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function pickCredential() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });
    if (!result.canceled) setCredentialUri(result.assets[0].uri);
  }

  async function onSubmit(data: FormData) {
    if (!credentialUri) {
      Alert.alert('Requerido', 'Por favor sube tu credencial profesional');
      return;
    }
    if (!termsAccepted) {
      Alert.alert('Requerido', 'Debes aceptar los términos de uso para continuar.');
      return;
    }
    setLoading(true);
    try {
      await signUp(data.email, data.password, {
        role: 'vet',
        name: data.name,
        rut: data.rut,
        phone: data.phone,
        email: data.email,
        address: data.address,
        region: data.region,
        city: data.city,
      });

      // After sign up, user is available
      if (firebaseUser) {
        const credentialUrl = await uploadImage(credentialUri);

        await setDoc(doc(db, 'veterinarians', firebaseUser.uid), {
          userId: firebaseUser.uid,
          name: data.name,
          rut: data.rut,
          address: data.address,
          phone: data.phone,
          email: data.email,
          consultationFee: Number(data.consultationFee),
          licenseNumber: data.licenseNumber,
          credentialUrl,
          status: 'pending',
          specialties: [],
          availability: {},
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
            <Text className="text-3xl font-bold text-primary-700">🩺 Médico Veterinario</Text>
            <Text className="text-gray-500 mt-2">Tu cuenta será revisada antes de activarse</Text>
          </View>

          <View className="gap-4">
            {[
              { name: 'name' as const, label: 'Nombre completo', placeholder: 'Dr. Juan Pérez' },
              { name: 'rut' as const, label: 'RUT', placeholder: '12.345.678-9' },
              { name: 'licenseNumber' as const, label: 'Nº Registro Profesional', placeholder: 'CVCh 12345' },
              { name: 'phone' as const, label: 'Teléfono', placeholder: '+56 9 1234 5678', keyboard: 'phone-pad' },
              { name: 'email' as const, label: 'Correo electrónico', placeholder: 'dr@ejemplo.com', keyboard: 'email-address' },
              { name: 'password' as const, label: 'Contraseña', placeholder: '••••••••', secure: true },
              { name: 'address' as const, label: 'Dirección de consulta', placeholder: 'Av. Veterinaria 123' },
              { name: 'region' as const, label: 'Región', placeholder: 'Metropolitana' },
              { name: 'city' as const, label: 'Ciudad / Comuna', placeholder: 'Providencia' },
              { name: 'consultationFee' as const, label: 'Valor por consulta (CLP)', placeholder: '25000', keyboard: 'number-pad' },
            ].map((f) => (
              <View key={f.name}>
                <Text className="text-sm font-medium text-gray-700 mb-1">{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                      placeholder={f.placeholder}
                      keyboardType={(f as any).keyboard || 'default'}
                      autoCapitalize={(f as any).keyboard === 'email-address' ? 'none' : 'words'}
                      secureTextEntry={(f as any).secure}
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

            {/* Credential upload */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Credencial Profesional *</Text>
              <TouchableOpacity
                className="border-2 border-dashed border-primary-300 rounded-xl py-6 items-center bg-green-50"
                onPress={pickCredential}
              >
                <Text className="text-2xl mb-2">{credentialUri ? '✅' : '📄'}</Text>
                <Text className="text-primary-600 font-medium">
                  {credentialUri ? 'Documento cargado' : 'Subir credencial o título'}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">Foto o PDF del título profesional</Text>
              </TouchableOpacity>
            </View>
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
