import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Appointment, Veterinarian } from '@junglapp/types';

const { db } = initFirebase();

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  confirmed: { label: 'Confirmada', color: 'text-green-600', bg: 'bg-green-100' },
  arrived: { label: 'Llegó', color: 'text-blue-600', bg: 'bg-blue-100' },
  completed: { label: 'Completada', color: 'text-gray-600', bg: 'bg-gray-100' },
  cancelled: { label: 'Cancelada', color: 'text-red-500', bg: 'bg-red-100' },
};

export default function VetDashboardScreen() {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [vetProfile, setVetProfile] = useState<Veterinarian | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    if (!user) return;
    const vetSnap = await getDocs(
      query(collection(db, COLLECTIONS.VETERINARIANS), where('userId', '==', user.uid))
    );
    if (!vetSnap.empty) {
      const vet = { id: vetSnap.docs[0].id, ...vetSnap.docs[0].data() } as Veterinarian;
      setVetProfile(vet);

      const apptSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.APPOINTMENTS),
          where('vetId', '==', vet.id),
          where('status', 'in', ['pending', 'confirmed', 'arrived']),
          orderBy('date', 'asc')
        )
      );
      setAppointments(apptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Appointment)));
    }
  }

  useEffect(() => { loadData(); }, [user]);

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  if (vetProfile?.status === 'pending') {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-5xl mb-4">⏳</Text>
        <Text className="text-xl font-bold text-gray-700 text-center">Cuenta en revisión</Text>
        <Text className="text-gray-500 text-sm mt-2 text-center">
          Tu perfil está siendo validado por el equipo de JunglApp. Te notificaremos cuando esté aprobado.
        </Text>
        <TouchableOpacity className="mt-6 bg-gray-100 rounded-xl px-4 py-2" onPress={logOut}>
          <Text className="text-gray-600">Cerrar sesión</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        {/* Header */}
        <View className="bg-blue-600 px-6 pb-8 pt-4 rounded-b-3xl">
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-white/70 text-sm">Panel Veterinario</Text>
              <Text className="text-white text-2xl font-bold">Dr. {user?.name?.split(' ')[0]} 🩺</Text>
            </View>
            <TouchableOpacity className="bg-white/20 rounded-full p-2" onPress={logOut}>
              <Text className="text-white text-sm px-2">Salir</Text>
            </TouchableOpacity>
          </View>
          <View className="flex-row gap-3 mt-6">
            <View className="flex-1 bg-white/20 rounded-2xl p-3 items-center">
              <Text className="text-white text-2xl font-bold">
                {appointments.filter((a) => a.status !== 'completed').length}
              </Text>
              <Text className="text-white/80 text-xs">Citas hoy</Text>
            </View>
            <View className="flex-1 bg-white/20 rounded-2xl p-3 items-center">
              <Text className="text-white text-2xl font-bold">
                {appointments.filter((a) => a.status === 'confirmed').length}
              </Text>
              <Text className="text-white/80 text-xs">Confirmadas</Text>
            </View>
          </View>
        </View>

        <View className="px-6 mt-6">
          <Text className="text-gray-700 font-semibold text-base mb-3">Próximas Citas</Text>

          {appointments.length === 0 ? (
            <View className="bg-blue-50 rounded-2xl p-8 items-center">
              <Text className="text-4xl mb-2">📅</Text>
              <Text className="text-gray-500">No hay citas programadas</Text>
            </View>
          ) : (
            <View className="gap-3 pb-6">
              {appointments.map((appt) => {
                const status = STATUS_LABELS[appt.status];
                return (
                  <TouchableOpacity
                    key={appt.id}
                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
                    onPress={() => router.push(`/(vet)/appointment/${appt.id}` as any)}
                  >
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-800">Consulta veterinaria</Text>
                        <Text className="text-gray-500 text-sm mt-0.5">{appt.date} — {appt.time}</Text>
                        {appt.reason && <Text className="text-gray-400 text-xs mt-1">{appt.reason}</Text>}
                      </View>
                      <View className={`${status.bg} rounded-full px-3 py-1`}>
                        <Text className={`text-xs font-medium ${status.color}`}>{status.label}</Text>
                      </View>
                    </View>
                    <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-gray-50">
                      <Text className="text-blue-500 text-sm font-medium">Ver detalles →</Text>
                      {appt.status === 'confirmed' && (
                        <View className="bg-blue-100 rounded-full px-3 py-1">
                          <Text className="text-blue-600 text-xs">Marcar llegada</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
