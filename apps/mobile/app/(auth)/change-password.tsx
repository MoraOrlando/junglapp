import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';

const { auth, db } = initFirebase();
const GREEN = '#16a34a';

export default function ChangePasswordScreen() {
  const { user, firebaseUser } = useAuth();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const requirements = [
    { label: 'Mínimo 8 caracteres', ok: newPassword.length >= 8 },
    { label: 'Al menos una mayúscula', ok: /[A-Z]/.test(newPassword) },
    { label: 'Al menos un número', ok: /\d/.test(newPassword) },
  ];

  const allOk = requirements.every((r) => r.ok);

  async function handleChange() {
    if (!allOk) {
      Alert.alert('Contraseña débil', 'Tu nueva contraseña no cumple los requisitos mínimos.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('No coinciden', 'Las contraseñas ingresadas no son iguales.');
      return;
    }
    if (!firebaseUser || !user) return;
    setLoading(true);
    try {
      await updatePassword(firebaseUser, newPassword);
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
        mustChangePassword: false,
        passwordChangedAt: new Date().toISOString(),
      });
      Alert.alert('✅ Contraseña actualizada', 'Tu nueva contraseña fue guardada correctamente.', [
        {
          text: 'Continuar',
          onPress: () => {
            if (user.role === 'owner') router.replace('/(owner)');
            else if (user.role === 'vet') router.replace('/(vet)');
            else if (user.role === 'store') router.replace('/(store)');
            else if (user.role === 'walker') router.replace('/(walker)');
            else if (user.role === 'grooming') router.replace('/(grooming)');
            else router.replace('/(auth)/login');
          },
        },
      ]);
    } catch (e: any) {
      if (e.code === 'auth/requires-recent-login') {
        Alert.alert('Sesión expirada', 'Por seguridad, debes iniciar sesión nuevamente para cambiar tu contraseña.');
        router.replace('/(auth)/login');
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
          {/* Header */}
          <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 32 }}>
            <View style={{ backgroundColor: '#FEF9C3', borderRadius: 40, width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 40 }}>🔐</Text>
            </View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#1F2937', textAlign: 'center' }}>
              Crea tu nueva contraseña
            </Text>
            <Text style={{ color: '#6B7280', marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
              Por tu seguridad, debes crear una nueva contraseña para continuar usando JunglApp.
            </Text>
          </View>

          {/* Nueva contraseña */}
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
              Nueva contraseña
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, backgroundColor: '#fff' }}>
              <TextInput
                style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1F2937' }}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showNew}
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowNew(!showNew)} style={{ paddingHorizontal: 14 }}>
                <Text style={{ fontSize: 18 }}>{showNew ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirmar contraseña */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
              Confirmar contraseña
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: confirmPassword && confirmPassword !== newPassword ? '#EF4444' : '#E5E7EB',
            }}>
              <TextInput
                style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1F2937' }}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showConfirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={{ paddingHorizontal: 14 }}>
                <Text style={{ fontSize: 18 }}>{showConfirm ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
            {confirmPassword && confirmPassword !== newPassword && (
              <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>Las contraseñas no coinciden</Text>
            )}
          </View>

          {/* Requisitos */}
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#F3F4F6' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 10 }}>Requisitos:</Text>
            {requirements.map((req) => (
              <View key={req.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 14 }}>{req.ok ? '✅' : '⭕'}</Text>
                <Text style={{ fontSize: 13, color: req.ok ? '#059669' : '#6B7280' }}>{req.label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: allOk && newPassword === confirmPassword ? GREEN : '#D1D5DB',
              borderRadius: 16, paddingVertical: 16, alignItems: 'center',
              flexDirection: 'row', justifyContent: 'center', gap: 8,
              marginBottom: 40,
            }}
            onPress={handleChange}
            disabled={loading || !allOk || newPassword !== confirmPassword}
          >
            {loading && <ActivityIndicator size="small" color="#fff" />}
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
