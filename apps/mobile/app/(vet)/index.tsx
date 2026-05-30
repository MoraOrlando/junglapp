import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Appointment, Veterinarian } from '@junglapp/types';

const { db } = initFirebase();

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(timeStr: string) {
  // expects "HH:MM" 24h
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function isLate(timeStr: string): boolean {
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const apptMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > apptMinutes + 10;
}

function petEmoji(appt: Appointment): string {
  // Appointments don't carry species directly — use a neutral paw, can be extended
  return '🐕';
}

export default function VetDashboardScreen() {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [vetProfile, setVetProfile] = useState<Veterinarian | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const today = new Date();

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

  const pendingCount = appointments.filter((a) => a.status === 'pending').length;
  const completedFee = vetProfile
    ? appointments.filter((a) => a.status === 'completed').length * (vetProfile.consultationFee || 0)
    : 0;

  if (vetProfile?.status === 'pending') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
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
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Header */}
      <View style={{ backgroundColor: '#1B4332' }} className="px-5 pt-4 pb-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-white/70 text-xs font-medium uppercase tracking-wide">Daily Agenda</Text>
            <Text className="text-white text-lg font-semibold mt-0.5">{formatDate(today)}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              className="border border-white/30 rounded-full px-3 py-1.5"
              onPress={() => router.push('/(vet)/calendar' as any)}
            >
              <Text className="text-white text-xs font-medium">Week View</Text>
            </TouchableOpacity>
            {pendingCount > 0 && (
              <View style={{ backgroundColor: '#52B788' }} className="rounded-full px-3 py-1.5">
                <Text className="text-white text-xs font-bold">{pendingCount} Pending</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {/* Welcome Banner */}
        <View style={{ backgroundColor: '#2D6A4F' }} className="mx-4 mt-4 rounded-2xl p-5">
          <Text className="text-white text-base font-bold">El Veterinario ha llegado 👋</Text>
          <Text className="text-white/80 text-sm mt-1">¿Listo para comenzar las citas de hoy?</Text>
          <TouchableOpacity
            style={{ backgroundColor: '#52B788' }}
            className="mt-4 self-start flex-row items-center rounded-full px-5 py-2.5"
            onPress={() => appointments[0] && router.push(`/(vet)/appointment/${appointments[0].id}` as any)}
          >
            <Text className="text-white font-semibold text-sm">Iniciar Consulta</Text>
            <Text className="text-white ml-1.5">▶</Text>
          </TouchableOpacity>
        </View>

        {/* Appointments */}
        <View className="px-4 mt-5">
          <Text className="text-gray-700 font-semibold text-sm mb-3 uppercase tracking-wide">
            Appointments — {today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>

          {appointments.length === 0 ? (
            <View className="bg-white rounded-2xl p-10 items-center shadow-sm border border-gray-100">
              <Text className="text-4xl mb-2">📅</Text>
              <Text className="text-gray-500 text-sm">No hay citas programadas hoy</Text>
            </View>
          ) : (
            <View className="gap-3">
              {appointments.map((appt) => {
                const late = isLate(appt.time || '00:00');
                const borderColor = late ? '#EF4444' : '#2D6A4F';
                const timeColor = late ? 'text-red-500' : 'text-green-700';
                return (
                  <TouchableOpacity
                    key={appt.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-row overflow-hidden"
                    style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
                    onPress={() => router.push(`/(vet)/appointment/${appt.id}` as any)}
                  >
                    <View className="flex-1 flex-row items-center px-4 py-4 gap-3">
                      {/* Pet Avatar */}
                      <View className="bg-gray-100 rounded-full w-12 h-12 items-center justify-center">
                        <Text className="text-2xl">{petEmoji(appt)}</Text>
                      </View>
                      {/* Info */}
                      <View className="flex-1">
                        <Text className={`text-sm font-bold ${timeColor}`}>
                          {formatTime(appt.time || '00:00')}
                        </Text>
                        <Text className="text-gray-800 font-semibold text-base">Consulta veterinaria</Text>
                        {appt.reason ? (
                          <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>{appt.reason}</Text>
                        ) : (
                          <Text className="text-gray-400 text-xs mt-0.5">Owner: —</Text>
                        )}
                      </View>
                      {/* Menu */}
                      <TouchableOpacity className="px-2 py-1">
                        <Text className="text-gray-400 text-lg">⋮</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Earnings Card */}
        <View className="mx-4 mt-5 mb-8 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <Text className="text-gray-400 text-xs uppercase tracking-wide font-medium">Total Earnings Today</Text>
          <Text className="text-3xl font-bold mt-1" style={{ color: '#2D6A4F' }}>
            ${completedFee.toLocaleString('es-CL')}
          </Text>
          <Text className="text-gray-400 text-xs mt-1">
            {appointments.filter((a) => a.status === 'completed').length} consultas completadas
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
