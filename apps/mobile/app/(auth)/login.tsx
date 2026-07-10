import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { doc, getDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

const { db } = initFirebase();

// Biometric + SecureStore — only available in native builds, not Expo Go
let LocalAuthentication: any = null;
let SecureStore: any = null;
try { LocalAuthentication = require('expo-local-authentication'); } catch {}
try { SecureStore = require('expo-secure-store'); } catch {}

const CREDS_KEY = 'junglapp_saved_creds';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});
type FormData = z.infer<typeof schema>;

// Use inline style everywhere — NativeWind padding can misalign text on Android in Expo Go
const inputStyle = {
  height: 52,
  paddingHorizontal: 16,
  fontSize: 16,
  color: '#1F2937',
  textAlignVertical: 'center' as const,
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 12,
  backgroundColor: '#FFFFFF',
};

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, logOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Biométrico');
  const [hasSavedCreds, setHasSavedCreds] = useState(false);

  const { control, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    async function checkBiometrics() {
      if (!LocalAuthentication || !SecureStore) return;
      try {
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

        const saved = await SecureStore.getItemAsync(CREDS_KEY);
        if (saved) {
          const { email } = JSON.parse(saved);
          setValue('email', email);
          setHasSavedCreds(true);
        }
      } catch {}
    }
    checkBiometrics();
  }, []);

  async function handleBiometricLogin() {
    if (!LocalAuthentication || !SecureStore) return;
    const saved = await SecureStore.getItemAsync(CREDS_KEY);
    if (!saved) { Alert.alert('Sin sesión guardada', 'Inicia sesión manualmente primero.'); return; }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Ingresar a JunglApp con ${biometricType}`,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar contraseña',
    });

    if (result.success) {
      const { email, password, storedAt } = JSON.parse(saved);
      // Expire stored credentials after 30 days
      if (storedAt && Date.now() - storedAt > 30 * 24 * 60 * 60 * 1000) {
        await SecureStore.deleteItemAsync(CREDS_KEY);
        Alert.alert('Sesión expirada', 'Por seguridad, inicia sesión manualmente.');
        return;
      }
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
      const firebaseUser = await signIn(data.email, data.password);
      if (SecureStore) {
        await SecureStore.setItemAsync(
          CREDS_KEY,
          JSON.stringify({ email: data.email, password: data.password, storedAt: Date.now() }),
          { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
        );
      }
      // Verificar si la cuenta fue bloqueada por soporte
      if (firebaseUser?.uid) {
        const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid));
        if (userDoc.data()?.accountStatus === 'blocked') {
          await logOut();
          Alert.alert(
            'Cuenta suspendida',
            'Tu cuenta fue desactivada por incumplir las normas de la comunidad. Si crees que es un error, contáctanos.'
          );
          return;
        }
        // Verificar si debe cambiar contraseña
        if (userDoc.data()?.mustChangePassword) {
          router.replace('/(auth)/change-password');
          return;
        }
      }
    } catch (e: any) {
      // Firebase Auth intentionally returns the same code for "wrong password"
      // and "no account with this email" (as of firebase-js-sdk ~9.15+), to
      // prevent apps from being used to enumerate which emails are registered.
      // Don't try to tell these apart — offer a generic message plus a way
      // to register, without revealing which case actually happened.
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
        Alert.alert(
          'No pudimos iniciar sesión',
          'Revisa tu correo y contraseña. Si aún no tienes una cuenta, puedes crear una ahora.',
          [
            { text: 'Reintentar', style: 'cancel' },
            { text: '¿No tienes cuenta? Regístrate', onPress: () => router.push('/(auth)/register' as any) },
          ]
        );
      } else {
        Alert.alert('Error', e.message || 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 24 }}>
            <Image
              source={require('../../assets/icon.png')}
              style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 12 }}
              resizeMode="contain"
            />
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#15803d', textAlign: 'center' }}>
              Welcome to the JunglApp 🐾
            </Text>
            <Text style={{ color: '#6B7280', marginTop: 6, textAlign: 'center' }}>Inicia sesión en tu cuenta</Text>
          </View>

          {/* Biometric quick login — only shows in native builds */}
          {biometricAvailable && hasSavedCreds && (
            <TouchableOpacity
              style={{
                backgroundColor: '#f0fdf4',
                borderWidth: 2,
                borderColor: '#bbf7d0',
                borderRadius: 16,
                paddingVertical: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                marginBottom: 24,
              }}
              onPress={handleBiometricLogin}
              disabled={loading}
            >
              <Text style={{ fontSize: 24 }}>{biometricType === 'Face ID' ? '🪪' : '👆'}</Text>
              <Text style={{ color: '#15803d', fontWeight: '600', fontSize: 16 }}>
                Ingresar con {biometricType}
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ gap: 16 }}>
            {/* Email */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 }}>
                Correo electrónico
              </Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={inputStyle}
                    placeholder="correo@ejemplo.com"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    onChangeText={(t) => onChange(t.replace(/\s/g, ''))}
                    value={value}
                  />
                )}
              />
              {errors.email && <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{errors.email.message}</Text>}
            </View>

            {/* Password */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151' }}>Contraseña</Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                  <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: '500' }}>¿Olvidaste tu contraseña?</Text>
                </TouchableOpacity>
              </View>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      style={{ ...inputStyle, paddingRight: 48 }}
                      placeholder="••••••••"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showPassword}
                      autoComplete="password"
                      textContentType="password"
                      onChangeText={(t) => onChange(t.replace(/\s/g, ''))}
                      value={value}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
              {errors.password && <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{errors.password.message}</Text>}
            </View>

            {/* Login button */}
            <TouchableOpacity
              style={{
                backgroundColor: loading ? '#86efac' : '#16a34a',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                marginTop: 8,
              }}
              onPress={handleSubmit(onSubmit)}
              disabled={loading}
            >
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>
                {loading ? 'Ingresando...' : 'Iniciar Sesión'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, marginBottom: 40 }}>
            <Text style={{ color: '#6B7280' }}>¿No tienes cuenta? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={{ color: '#16a34a', fontWeight: '600' }}>Regístrate</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
