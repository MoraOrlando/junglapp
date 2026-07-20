import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { initFirebase, firebaseConfig, COLLECTIONS, handleEmailAlreadyInUse } from '@junglapp/firebase';
import type { User } from '@junglapp/types';
import { useAuth } from '../../context/AuthContext';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

export default function SupportProfileScreen() {
  const { user, logOut } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [creating, setCreating] = useState(false);

  async function createAdmin() {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('', 'Completa nombre, correo y contraseña.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('', 'Las contraseñas no coinciden.');
      return;
    }

    setCreating(true);
    // Create the new account on a throwaway secondary Firebase App instance
    // so createUserWithEmailAndPassword doesn't swap out the currently
    // signed-in admin's session on the primary app.
    const secondaryApp = initializeApp(firebaseConfig, `admin-create-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    try {
      const { user: newUser } = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
      const newAdmin: User = {
        uid: newUser.uid,
        role: 'support',
        name: name.trim(),
        rut: '',
        phone: '',
        email: email.trim(),
        address: '',
        region: '',
        city: '',
        accountStatus: 'active',
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, COLLECTIONS.USERS, newUser.uid), newAdmin);
      await signOut(secondaryAuth);
      Alert.alert('✅ Listo', `Se creó la cuenta de soporte para ${email.trim()}.`);
      setName(''); setEmail(''); setPassword(''); setConfirmPassword('');
    } catch (e: any) {
      if (e?.code === 'auth/email-already-in-use') {
        await handleEmailAlreadyInUse(email.trim());
      } else {
        Alert.alert('Error', e?.message ?? 'No se pudo crear la cuenta.');
      }
    } finally {
      await deleteApp(secondaryApp).catch(() => {});
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <ScrollView style={{ flex: 1 }}>
        <View style={{ backgroundColor: PURPLE, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Sesión activa</Text>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 }}>👤 {user?.name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>{user?.email}</Text>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 20 }}>
            <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, marginBottom: 4 }}>+ Crear administrador</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 14 }}>
              Crea otra cuenta con el mismo acceso de soporte. No cierra tu sesión actual.
            </Text>

            <TextInput
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 10 }}
              placeholder="Nombre completo"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 10 }}
              placeholder="Correo"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 10 }}
              placeholder="Contraseña (mín. 6 caracteres)"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 16 }}
              placeholder="Confirmar contraseña"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <TouchableOpacity
              onPress={createAdmin}
              disabled={creating}
              style={{ backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: creating ? 0.7 : 1 }}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Crear cuenta de soporte</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={logOut} style={{ borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 16, paddingVertical: 16, alignItems: 'center', backgroundColor: '#FEF2F2', marginBottom: 40 }}>
            <Text style={{ color: '#EF4444', fontWeight: '700' }}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
