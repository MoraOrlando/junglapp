import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../context/AuthContext';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});
type FormData = z.infer<typeof schema>;

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'microsoft' | null>(null);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await signIn(data.email, data.password);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setSocialLoading('google');
    try {
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSocialLoading(null);
    }
  }

  async function handleMicrosoft() {
    setSocialLoading('microsoft');
    try {
      await signInWithMicrosoft();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSocialLoading(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6">
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-8">
            <Text className="text-primary-500 text-base">← Volver</Text>
          </TouchableOpacity>

          <View className="mb-8">
            <Text className="text-3xl font-bold text-primary-700">Bienvenido de vuelta 🐾</Text>
            <Text className="text-gray-500 mt-2">Inicia sesión en tu cuenta</Text>
          </View>

          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Correo electrónico</Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                    placeholder="correo@ejemplo.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              {errors.email && <Text className="text-red-500 text-xs mt-1">{errors.email.message}</Text>}
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Contraseña</Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                    placeholder="••••••••"
                    secureTextEntry
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              {errors.password && <Text className="text-red-500 text-xs mt-1">{errors.password.message}</Text>}
            </View>

            <TouchableOpacity
              className={`bg-primary-500 rounded-2xl py-4 items-center mt-4 ${loading ? 'opacity-70' : ''}`}
              onPress={handleSubmit(onSubmit)}
              disabled={loading}
            >
              <Text className="text-white font-semibold text-base">
                {loading ? 'Ingresando...' : 'Iniciar Sesión'}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View className="flex-row items-center my-2">
              <View className="flex-1 h-px bg-gray-200" />
              <Text className="mx-4 text-gray-400 text-sm">o continuar con</Text>
              <View className="flex-1 h-px bg-gray-200" />
            </View>

            {/* Google */}
            <TouchableOpacity
              className="flex-row items-center justify-center border border-gray-200 rounded-2xl py-3 bg-white gap-2"
              onPress={handleGoogle}
              disabled={socialLoading !== null}
            >
              <Text className="text-lg">🔴</Text>
              <Text className="font-semibold text-gray-700">
                {socialLoading === 'google' ? 'Conectando...' : 'Google'}
              </Text>
            </TouchableOpacity>

            {/* Microsoft */}
            <TouchableOpacity
              className="flex-row items-center justify-center border border-gray-200 rounded-2xl py-3 bg-white gap-2"
              onPress={handleMicrosoft}
              disabled={socialLoading !== null}
            >
              <Text className="text-lg">🔷</Text>
              <Text className="font-semibold text-gray-700">
                {socialLoading === 'microsoft' ? 'Conectando...' : 'Microsoft'}
              </Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-center mt-6">
            <Text className="text-gray-500">¿No tienes cuenta? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text className="text-primary-500 font-semibold">Regístrate</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
