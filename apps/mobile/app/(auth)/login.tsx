import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';

const CREDS_KEY = 'junglapp_saved_creds';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});
type FormData = z.infer<typeof schema>;

const inputStyle = {
  height: 52,
  paddingHorizontal: 16,
  fontSize: 16,
  color: '#1F2937',
  textAlignVertical: 'center' as const,
};

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'microsoft' | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biométrico');
  const [hasSavedCreds, setHasSavedCreds] = useState(false);

  const { control, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    async function checkBiometrics() {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

      if (hasHardware && isEnrolled) {
        setBiometricAvailable(true);
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Huella dactilar');
        }
      }

      // Check if there are saved credentials
      const saved = await SecureStore.getItemAsync(CREDS_KEY);
      if (saved) {
        const { email } = JSON.parse(saved);
        setValue('email', email);
        setHasSavedCreds(true);
      }
    }
    checkBiometrics();
  }, []);

  async function handleBiometricLogin() {
    const saved = await SecureStore.getItemAsync(CREDS_KEY);
    if (!saved) { Alert.alert('Sin sesión guardada', 'Inicia sesión manualmente primero.'); return; }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Ingresar a JunglApp con ${biometricType}`,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar contraseña',
    });

    if (result.success) {
      const { email, password } = JSON.parse(saved);
      setLoading(true);
      try {
        await signIn(email, password);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await signIn(data.email, data.password);
      // Save credentials for biometric login next time
      await SecureStore.setItemAsync(CREDS_KEY, JSON.stringify({ email: data.email, password: data.password }));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setSocialLoading('google');
    try { await signInWithGoogle(); } catch (e: any) { Alert.alert('Error', e.message); } finally { setSocialLoading(null); }
  }

  async function handleMicrosoft() {
    setSocialLoading('microsoft');
    try { await signInWithMicrosoft(); } catch (e: any) { Alert.alert('Error', e.message); } finally { setSocialLoading(null); }
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

          {/* Biometric quick login */}
          {biometricAvailable && hasSavedCreds && (
            <TouchableOpacity
              className="bg-primary-50 border-2 border-primary-200 rounded-2xl py-4 flex-row items-center justify-center gap-3 mb-6"
              onPress={handleBiometricLogin}
              disabled={loading}
            >
              <Text className="text-2xl">{biometricType === 'Face ID' ? '🪪' : '👆'}</Text>
              <Text className="text-primary-700 font-semibold text-base">Ingresar con {biometricType}</Text>
            </TouchableOpacity>
          )}

          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Correo electrónico</Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    className="border border-gray-200 rounded-xl bg-white"
                    style={inputStyle}
                    placeholder="correo@ejemplo.com"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
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
                    className="border border-gray-200 rounded-xl bg-white"
                    style={inputStyle}
                    placeholder="••••••••"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                    autoComplete="password"
                    textContentType="password"
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              {errors.password && <Text className="text-red-500 text-xs mt-1">{errors.password.message}</Text>}
            </View>

            <TouchableOpacity
              className={`bg-primary-500 rounded-2xl py-4 items-center mt-2 ${loading ? 'opacity-70' : ''}`}
              onPress={handleSubmit(onSubmit)}
              disabled={loading}
            >
              <Text className="text-white font-semibold text-base">
                {loading ? 'Ingresando...' : 'Iniciar Sesión'}
              </Text>
            </TouchableOpacity>

            <View className="flex-row items-center my-2">
              <View className="flex-1 h-px bg-gray-200" />
              <Text className="mx-4 text-gray-400 text-sm">o continuar con</Text>
              <View className="flex-1 h-px bg-gray-200" />
            </View>

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

          <View className="flex-row justify-center mt-6 mb-10">
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
