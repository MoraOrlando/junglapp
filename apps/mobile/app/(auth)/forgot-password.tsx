import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initFirebase } from '@junglapp/firebase';
import { validateEmail } from '../../lib/email';

const { app } = initFirebase();
// Cloud Functions moved to southamerica-west1 (see functions/src/index.ts) —
// this must match or the client gets a not-found error calling a region
// where the function no longer exists.
const fns = getFunctions(app, 'southamerica-west1');

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
    const trimmed = email.trim().toLowerCase();
    if (!validateEmail(trimmed)) {
      Alert.alert('Correo inválido', 'Ingresa un correo electrónico válido.');
      return;
    }
    setLoading(true);
    try {
      const sendTempPassword = httpsCallable(fns, 'sendTempPassword');
      await sendTempPassword({ email: trimmed });
      setSent(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo procesar la solicitud. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 32 }}>
            <Text style={{ color: '#16a34a', fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          {sent ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
              <Text style={{ fontSize: 64, marginBottom: 16 }}>📬</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#1F2937', textAlign: 'center' }}>
                ¡Contraseña temporal enviada!
              </Text>
              <Text style={{ color: '#6B7280', marginTop: 10, textAlign: 'center', lineHeight: 22, fontSize: 15 }}>
                Enviamos una contraseña temporal a{'\n'}
                <Text style={{ fontWeight: '700', color: '#374151' }}>{email.trim()}</Text>
              </Text>
              <View style={{ backgroundColor: '#F0FDF4', borderRadius: 14, padding: 18, marginTop: 20, borderWidth: 1, borderColor: '#BBF7D0', width: '100%' }}>
                <Text style={{ color: '#166534', fontSize: 14, lineHeight: 24 }}>
                  1️⃣ Abre el correo y copia la contraseña temporal{'\n'}
                  2️⃣ Inicia sesión con esa contraseña{'\n'}
                  3️⃣ La app te pedirá crear una nueva contraseña segura
                </Text>
              </View>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
                Revisa también tu carpeta de spam.
              </Text>
              <TouchableOpacity
                style={{ marginTop: 28, backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40 }}
                onPress={() => router.replace('/(auth)/login')}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Ir a iniciar sesión</Text>
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
                onChangeText={(t) => setEmail(t.replace(/\s/g, ''))}
                onSubmitEditing={handleReset}
              />

              <TouchableOpacity
                style={{
                  backgroundColor: loading ? '#86efac' : '#16a34a',
                  borderRadius: 16, paddingVertical: 16,
                  alignItems: 'center', marginTop: 24,
                  flexDirection: 'row', justifyContent: 'center', gap: 8,
                }}
                onPress={handleReset}
                disabled={loading}
              >
                {loading && <ActivityIndicator size="small" color="#fff" />}
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>
                  {loading ? 'Enviando contraseña temporal...' : 'Enviar contraseña temporal'}
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
