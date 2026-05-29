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
import { useAuth } from '../../context/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { initFirebase } from '@junglapp/firebase';

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
  postalCode: z.string().min(4, 'Código postal requerido'),
});
type FormData = z.infer<typeof schema>;

export default function RegisterStoreScreen() {
  const router = useRouter();
  const { signUp, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await signUp(data.email, data.password, {
        role: 'store',
        name: data.name,
        rut: data.rut,
        phone: data.phone,
        email: data.email,
        address: data.address,
        postalCode: data.postalCode,
      });

      if (firebaseUser) {
        await setDoc(doc(db, 'stores', firebaseUser.uid), {
          userId: firebaseUser.uid,
          name: data.storeName,
          description: data.storeDescription,
          address: data.address,
          phone: data.phone,
          email: data.email,
          status: 'pending',
          categories: [],
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
            <Text className="text-3xl font-bold text-primary-700">🏪 Tienda Pet Shop</Text>
            <Text className="text-gray-500 mt-2">Tu tienda será revisada antes de activarse</Text>
          </View>

          <View className="gap-4">
            {[
              { name: 'name' as const, label: 'Tu nombre completo', placeholder: 'Juan Pérez' },
              { name: 'rut' as const, label: 'RUT', placeholder: '12.345.678-9' },
              { name: 'storeName' as const, label: 'Nombre de la tienda', placeholder: 'PetShop Mascotitas' },
              { name: 'storeDescription' as const, label: 'Descripción de la tienda', placeholder: 'Vendemos productos premium para mascotas...' },
              { name: 'phone' as const, label: 'Teléfono', placeholder: '+56 9 1234 5678', keyboard: 'phone-pad' },
              { name: 'email' as const, label: 'Correo electrónico', placeholder: 'tienda@ejemplo.com', keyboard: 'email-address' },
              { name: 'password' as const, label: 'Contraseña', placeholder: '••••••••', secure: true },
              { name: 'address' as const, label: 'Dirección de la tienda', placeholder: 'Av. Comercial 456' },
              { name: 'postalCode' as const, label: 'Código Postal', placeholder: '1234567', keyboard: 'number-pad' },
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
          </View>

          <TouchableOpacity
            className={`bg-primary-500 rounded-2xl py-4 items-center mt-6 mb-10 ${loading ? 'opacity-70' : ''}`}
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
