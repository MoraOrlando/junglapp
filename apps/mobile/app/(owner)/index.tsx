import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { initFirebase } from '@junglapp/firebase';
import { COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Pet, Appointment } from '@junglapp/types';

const { db } = initFirebase();

export default function OwnerHomeScreen() {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    if (!user) return;
    const petsSnap = await getDocs(
      query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))
    );
    setPets(petsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));

    const apptSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.APPOINTMENTS),
        where('ownerId', '==', user.uid),
        where('status', 'in', ['pending', 'confirmed']),
        orderBy('date', 'asc'),
        limit(3)
      )
    );
    setAppointments(apptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Appointment)));
  }

  useEffect(() => { loadData(); }, [user]);

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {/* Header */}
        <View className="bg-primary-500 px-6 pb-8 pt-4 rounded-b-3xl">
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-white/70 text-sm">Bienvenido,</Text>
              <Text className="text-white text-2xl font-bold">{user?.name?.split(' ')[0]} 🐾</Text>
            </View>
            <TouchableOpacity
              className="bg-white/20 rounded-full p-2"
              onPress={logOut}
            >
              <Text className="text-white text-sm px-2">Salir</Text>
            </TouchableOpacity>
          </View>

          {/* Quick stats */}
          <View className="flex-row gap-3 mt-6">
            <View className="flex-1 bg-white/20 rounded-2xl p-3 items-center">
              <Text className="text-white text-2xl font-bold">{pets.length}</Text>
              <Text className="text-white/80 text-xs">Mascotas</Text>
            </View>
            <View className="flex-1 bg-white/20 rounded-2xl p-3 items-center">
              <Text className="text-white text-2xl font-bold">{appointments.length}</Text>
              <Text className="text-white/80 text-xs">Citas próximas</Text>
            </View>
          </View>
        </View>

        <View className="px-6 mt-6">
          {/* Quick actions */}
          <Text className="text-gray-700 font-semibold text-base mb-3">Acciones rápidas</Text>
          <View className="flex-row gap-3 mb-6">
            {[
              { emoji: '➕', label: 'Agregar mascota', route: '/(owner)/pets/add' },
              { emoji: '🩺', label: 'Buscar veterinario', route: '/(owner)/vets' },
              { emoji: '💚', label: 'Ver Match', route: '/(owner)/match' },
              { emoji: '🛒', label: 'Tienda', route: '/(owner)/store' },
            ].map((action) => (
              <TouchableOpacity
                key={action.label}
                className="flex-1 bg-white rounded-2xl p-3 items-center shadow-sm border border-gray-100"
                onPress={() => router.push(action.route as any)}
              >
                <Text className="text-2xl mb-1">{action.emoji}</Text>
                <Text className="text-gray-600 text-xs text-center leading-tight">{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Pets section */}
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-gray-700 font-semibold text-base">Mis Mascotas</Text>
            <TouchableOpacity onPress={() => router.push('/(owner)/pets' as any)}>
              <Text className="text-primary-500 text-sm">Ver todas →</Text>
            </TouchableOpacity>
          </View>

          {pets.length === 0 ? (
            <TouchableOpacity
              className="bg-green-50 border-2 border-dashed border-primary-300 rounded-2xl p-6 items-center mb-6"
              onPress={() => router.push('/(owner)/pets/add' as any)}
            >
              <Text className="text-4xl mb-2">🐾</Text>
              <Text className="text-primary-600 font-medium">Agrega tu primera mascota</Text>
              <Text className="text-gray-400 text-sm mt-1">Toca aquí para comenzar</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
              {pets.map((pet) => (
                <TouchableOpacity
                  key={pet.id}
                  className="bg-white rounded-2xl p-4 mr-3 shadow-sm border border-gray-100 w-36"
                  onPress={() => router.push(`/(owner)/pets/${pet.id}` as any)}
                >
                  <View className="bg-primary-100 rounded-xl h-20 items-center justify-center mb-2">
                    <Text className="text-3xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                  </View>
                  <Text className="font-semibold text-gray-800">{pet.name}</Text>
                  <Text className="text-gray-400 text-xs">{pet.breed}</Text>
                  {pet.lookingForPartner && (
                    <View className="bg-pink-100 rounded-full px-2 py-0.5 mt-1">
                      <Text className="text-pink-600 text-xs">💕 Busca pareja</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Upcoming appointments */}
          {appointments.length > 0 && (
            <View>
              <Text className="text-gray-700 font-semibold text-base mb-3">Próximas Citas</Text>
              {appointments.map((appt) => (
                <View key={appt.id} className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-gray-100">
                  <View className="flex-row items-center gap-3">
                    <View className="bg-blue-100 rounded-xl p-3">
                      <Text className="text-2xl">🩺</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-800">Consulta veterinaria</Text>
                      <Text className="text-gray-500 text-sm">{appt.date} — {appt.time}</Text>
                    </View>
                    <View className={`rounded-full px-3 py-1 ${appt.status === 'confirmed' ? 'bg-green-100' : 'bg-yellow-100'}`}>
                      <Text className={`text-xs font-medium ${appt.status === 'confirmed' ? 'text-green-600' : 'text-yellow-600'}`}>
                        {appt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
