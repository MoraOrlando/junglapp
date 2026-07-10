import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

export default function ProfileScreen() {
  const { user, logOut, deleteAccount, updateProfile } = useAuth();
  const router = useRouter();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  async function confirmDeleteAccount() {
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es irreversible. Se eliminarán todos tus datos permanentemente. ¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  }

  async function confirmLogout() {
    // Alert.alert doesn't work on web — use confirm() as fallback
    if (Platform.OS === 'web') {
      if (window.confirm('¿Seguro que deseas cerrar sesión?')) {
        await logOut();
      }
      return;
    }
    Alert.alert('Cerrar sesión', '¿Seguro que deseas salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => logOut() },
    ]);
  }

  function pickPhoto() {
    if (Platform.OS === 'web') {
      // On web use the image library only (no camera)
      ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1, 1] })
        .then((r) => { if (!r.canceled) saveProfilePhoto(r.assets[0].uri); });
      return;
    }
    Alert.alert('📷 Foto de perfil', '¿Cómo quieres agregar la foto?', [
      {
        text: 'Tomar foto', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const r = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
          if (!r.canceled) saveProfilePhoto(r.assets[0].uri);
        },
      },
      {
        text: 'Elegir de galería', onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1, 1] });
          if (!r.canceled) saveProfilePhoto(r.assets[0].uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function saveProfilePhoto(uri: string) {
    if (!user) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(uri);
      await updateProfile({ photoUrl: url });
    } catch (e: any) {
      const msg = e?.message ?? 'Error desconocido al subir la foto';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error al subir foto', msg);
      }
    } finally {
      setUploadingPhoto(false);
    }
  }

  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
    : '🐾';

  const rows: { label: string; value?: string; emoji: string }[] = [
    { label: 'Correo', value: user?.email, emoji: '✉️' },
    { label: 'Teléfono', value: user?.phone, emoji: '📞' },
    { label: 'RUT', value: user?.rut, emoji: '🪪' },
    { label: 'Dirección', value: user?.address, emoji: '🏠' },
    { label: 'Región', value: user?.region, emoji: '🗺️' },
    { label: 'Ciudad / Comuna', value: user?.city, emoji: '📍' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View className="bg-primary-500 px-6 pt-6 pb-10 rounded-b-3xl items-center">
          {/* Back to home */}
          <TouchableOpacity
            onPress={() => router.replace('/(owner)' as any)}
            style={{ position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text className="text-white font-semibold">← Volver</Text>
          </TouchableOpacity>

          {/* Avatar — tappable to change photo */}
          <TouchableOpacity onPress={pickPhoto} disabled={uploadingPhoto} activeOpacity={0.8}>
            <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.25)' }}>
              {user?.photoUrl ? (
                <Image
                  source={{ uri: user.photoUrl }}
                  style={{ width: 96, height: 96 }}
                  contentFit="cover"
                  contentPosition="top"
                />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 32, fontWeight: 'bold' }}>{initials}</Text>
                </View>
              )}
            </View>
            {/* Camera badge */}
            <View style={{
              position: 'absolute', bottom: 0, right: 0,
              backgroundColor: '#fff', borderRadius: 14, width: 28, height: 28,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: '#2D6A4F',
            }}>
              {uploadingPhoto
                ? <ActivityIndicator size="small" color="#2D6A4F" />
                : <Text style={{ fontSize: 13 }}>📷</Text>}
            </View>
          </TouchableOpacity>

          <Text className="text-white text-2xl font-bold mt-3">{user?.name || 'Family Lover'}</Text>
          <Text className="text-white/70 text-sm mt-0.5">Dueño de mascota 🐾</Text>
        </View>

        {/* Info card */}
        <View className="px-6 -mt-6">
          {user?.accountStatus === 'under_review' && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 16, borderWidth: 1, borderColor: '#FDE68A', padding: 14, marginBottom: 12 }}>
              <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>⚠️ Cuenta en revisión</Text>
              <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
                Un administrador está evaluando un reporte sobre tu cuenta.
              </Text>
            </View>
          )}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {rows.map((r, i) => (
              <View
                key={r.label}
                className={`flex-row items-center px-4 py-3.5 ${i < rows.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <Text className="text-lg mr-3">{r.emoji}</Text>
                <View className="flex-1">
                  <Text className="text-gray-400 text-xs">{r.label}</Text>
                  <Text className="text-gray-800 text-sm mt-0.5">{r.value || '—'}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Quick links */}
          <View className="mt-4 gap-3">
            <TouchableOpacity
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex-row items-center"
              onPress={() => router.push('/(owner)/addresses' as any)}
            >
              <Text className="text-xl mr-3">📍</Text>
              <Text className="flex-1 text-gray-800 font-medium">Mis direcciones</Text>
              <Text className="text-gray-300 text-xl">›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex-row items-center"
              onPress={() => router.push('/(owner)/chat' as any)}
            >
              <Text className="text-xl mr-3">💬</Text>
              <Text className="flex-1 text-gray-800 font-medium">Mis conversaciones</Text>
              <Text className="text-gray-300 text-xl">›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex-row items-center"
              onPress={() => router.push('/(auth)/terms' as any)}
            >
              <Text className="text-xl mr-3">📄</Text>
              <Text className="flex-1 text-gray-800 font-medium">Términos y Privacidad</Text>
              <Text className="text-gray-300 text-xl">›</Text>
            </TouchableOpacity>
          </View>

          {/* Logout */}
          <TouchableOpacity
            className="mt-6 rounded-2xl py-4 items-center border border-red-300 bg-red-100"
            onPress={confirmLogout}
          >
            <Text className="text-red-600 font-semibold">Cerrar sesión</Text>
          </TouchableOpacity>

          {/* Delete account */}
          <TouchableOpacity
            className="mt-3 rounded-2xl py-4 items-center border border-gray-200 bg-gray-50"
            onPress={confirmDeleteAccount}
          >
            <Text className="text-gray-500 font-semibold">Eliminar cuenta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
