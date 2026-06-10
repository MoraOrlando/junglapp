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
  // e.g. "Wednesday, October 25th"
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const day = d.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? 'st'
      : day === 2 || day === 22
      ? 'nd'
      : day === 3 || day === 23
      ? 'rd'
      : 'th';
  return `${weekday}, ${month} ${day}${suffix}`;
}

function formatTime(timeStr: string) {
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

      const todayStr = today.toISOString().slice(0, 10);
      const apptSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.APPOINTMENTS),
          where('vetId', '==', vet.id),
          where('date', '==', todayStr),
        )
      );
      const activeStatuses = ['pending', 'confirmed', 'arrived', 'completed'];
      const appts = apptSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Appointment))
        .filter((a) => activeStatuses.includes(a.status))
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      setAppointments(appts);
    }
  }

  useEffect(() => {
    loadData();
  }, [user]);

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  const pendingCount = appointments.filter((a) => ['pending', 'confirmed'].includes(a.status)).length;
  const completedCount = appointments.filter((a) => a.status === 'completed').length;
  const completedFee = vetProfile
    ? completedCount * (vetProfile.consultationFee || 0)
    : 0;

  if (vetProfile?.status === 'pending') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-5xl mb-4">⏳</Text>
        <Text className="text-xl font-bold text-gray-700 text-center">Cuenta en revisión</Text>
        <Text className="text-gray-500 text-sm mt-2 text-center">
          Tu perfil está siendo validado por el equipo de JunglApp. Te notificaremos cuando esté
          aprobado.
        </Text>
        <TouchableOpacity className="mt-6 bg-gray-100 rounded-xl px-4 py-2" onPress={logOut}>
          <Text className="text-gray-600">Cerrar sesión</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* ── Header ── */}
      <View style={{ backgroundColor: '#1B4332' }} className="px-5 pt-4 pb-6">
        <Text className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">
          Daily Agenda
        </Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-white text-xl font-bold flex-1 mr-3" numberOfLines={1}>
            {formatDate(today)}
          </Text>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              className="border border-white/30 rounded-full px-4 py-1.5"
              onPress={() => router.push('/(vet)/calendar' as any)}
            >
              <Text className="text-white text-xs font-semibold">Week View</Text>
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />
        }
      >
        {/* ── Welcome Banner ── */}
        <View style={{ backgroundColor: '#2D6A4F' }} className="mx-4 -mt-2 rounded-2xl p-5 shadow-md">
          <Text className="text-white text-base font-bold leading-snug">
            El Veterinario ha llegado 👋
          </Text>
          <Text className="text-white/80 text-sm mt-1">
            ¿Listo para comenzar las citas de hoy?
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#52B788' }}
            className="mt-4 self-start flex-row items-center rounded-full px-5 py-2.5 gap-1.5"
            onPress={() =>
              appointments[0] && router.push(`/(vet)/appointment/${appointments[0].id}` as any)
            }
          >
            <Text className="text-white font-semibold text-sm">Iniciar Consulta</Text>
            <Text className="text-white text-xs">▶</Text>
          </TouchableOpacity>
        </View>

        {/* ── Appointments list ── */}
        <View className="px-4 mt-6">
          <Text className="text-gray-500 font-semibold text-xs mb-3 uppercase tracking-widest">
            Appointments — {today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>

          {appointments.length === 0 ? (
            <View className="bg-white rounded-2xl p-10 items-center border border-gray-100 shadow-sm">
              <Text className="text-4xl mb-2">📅</Text>
              <Text className="text-gray-500 text-sm">No hay citas programadas hoy</Text>
            </View>
          ) : (
            <View className="gap-3">
              {appointments.map((appt) => {
                const late = isLate(appt.time || '00:00');
                const borderColor = late ? '#EF4444' : '#2D6A4F';
                const timeColor = late ? '#EF4444' : '#2D6A4F';
                return (
                  <TouchableOpacity
                    key={appt.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-row overflow-hidden"
                    style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/(vet)/appointment/${appt.id}` as any)}
                  >
                    <View className="flex-1 flex-row items-center px-4 py-4 gap-3">
                      {/* Pet Avatar */}
                      <View className="bg-gray-100 rounded-full w-12 h-12 items-center justify-center">
                        <Text className="text-2xl">{petEmoji(appt)}</Text>
                      </View>

                      {/* Info */}
                      <View className="flex-1">
                        <Text className="text-sm font-bold" style={{ color: timeColor }}>
                          {formatTime(appt.time || '00:00')}
                        </Text>
                        <Text className="text-gray-800 font-semibold text-base leading-tight mt-0.5">
                          Consulta veterinaria
                        </Text>
                        <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
                          {appt.reason ? appt.reason : 'Owner: —'}
                        </Text>
                      </View>

                      {/* Menu */}
                      <TouchableOpacity className="px-2 py-1 -mr-1">
                        <Text className="text-gray-300 text-xl leading-none">⋮</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Earnings Card ── */}
        <View className="mx-4 mt-5 mb-8 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <Text className="text-gray-400 text-xs uppercase tracking-widest font-semibold">
            Total Earnings Today
          </Text>
          <Text className="text-4xl font-bold mt-2" style={{ color: '#2D6A4F' }}>
            ${completedFee.toLocaleString('es-CL')}
          </Text>
          <Text className="text-gray-400 text-xs mt-1">
            {completedCount} consulta{completedCount !== 1 ? 's' : ''} completada
            {completedCount !== 1 ? 's' : ''}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
