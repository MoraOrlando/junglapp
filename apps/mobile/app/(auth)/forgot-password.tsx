import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendPasswordResetEmail } from 'firebase/auth';
import { initFirebase } from '@junglapp/firebase';

const { auth } = initFirebase();

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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Correo inválido', 'Ingresa un correo electrónico válido.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setSent(true);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        Alert.alert('Correo no registrado', 'No encontramos una cuenta con ese correo.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 32 }}>
            <Text style={{ color: '#16a34a', fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          {sent ? (
            /* Success state */
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
              <Text style={{ fontSize: 64, marginBottom: 16 }}>📬</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#1F2937', textAlign: 'center' }}>
                Revisa tu correo
              </Text>
              <Text style={{ color: '#6B7280', marginTop: 12, textAlign: 'center', lineHeight: 22 }}>
                Enviamos un enlace a{'\n'}
                <Text style={{ fontWeight: '600', color: '#374151' }}>{email.trim()}</Text>
                {'\n\n'}Haz clic en el enlace para crear una nueva contraseña. Revisa también tu carpeta de spam.
              </Text>
              <TouchableOpacity
                style={{ marginTop: 32, backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40 }}
                onPress={() => router.replace('/(auth)/login')}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Ir al inicio de sesión</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Form state */
            <View>
              <View style={{ marginBottom: 32 }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: '#15803d' }}>🔑 Recuperar contraseña</Text>
                <Text style={{ color: '#6B7280', marginTop: 8, lineHeight: 22 }}>
                  Ingresa tu correo registrado y te enviaremos un enlace para crear una nueva contraseña.
                </Text>
              </View>

              <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 }}>
                Correo electrónico
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="correo@ejemplo.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={handleReset}
              />

              <TouchableOpacity
                style={{
                  backgroundColor: loading ? '#86efac' : '#16a34a',
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginTop: 24,
                }}
                onPress={handleReset}
                disabled={loading}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>
                  {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 16, alignItems: 'center' }}
                onPress={() => router.back()}
              >
                <Text style={{ color: '#6B7280', fontSize: 14 }}>¿Recordaste tu contraseña? Iniciar sesión</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
