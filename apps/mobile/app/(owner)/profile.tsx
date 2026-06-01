import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function ProfileScreen() {
  const { user, logOut } = useAuth();
  const router = useRouter();

  function confirmLogout() {
    Alert.alert('Cerrar sesión', '¿Seguro que deseas salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => logOut() },
    ]);
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
          {user?.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={{ width: 96, height: 96, borderRadius: 48 }} contentFit="cover" />
          ) : (
            <View className="w-24 h-24 rounded-full bg-white/25 items-center justify-center">
              <Text className="text-white text-3xl font-bold">{initials}</Text>
            </View>
          )}
          <Text className="text-white text-2xl font-bold mt-3">{user?.name || 'Family Lover'}</Text>
          <Text className="text-white/70 text-sm mt-0.5">Dueño de mascota 🐾</Text>
        </View>

        {/* Info card */}
        <View className="px-6 -mt-6">
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
              onPress={() => router.push('/(owner)/chat' as any)}
            >
              <Text className="text-xl mr-3">💬</Text>
              <Text className="flex-1 text-gray-800 font-medium">Mis conversaciones</Text>
              <Text className="text-gray-300 text-xl">›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex-row items-center"
              onPress={() => router.push('/(owner)/lost' as any)}
            >
              <Text className="text-xl mr-3">🔍</Text>
              <Text className="flex-1 text-gray-800 font-medium">Mascotas extraviadas</Text>
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
            className="mt-6 rounded-2xl py-4 items-center border border-red-200 bg-red-50"
            onPress={confirmLogout}
          >
            <Text className="text-red-500 font-semibold">Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
