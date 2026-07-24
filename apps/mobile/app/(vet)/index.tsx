import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ref, onValue, off, remove } from 'firebase/database';
import { initFirebase, COLLECTIONS, RTDB_PATHS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import YearCalendar from '../../components/YearCalendar';
import type { Appointment, Veterinarian } from '@junglapp/types';

const { db, rtdb } = initFirebase();

function formatDate(d: Date) {
  const weekday = d.toLocaleDateString('es-CL', { weekday: 'long' });
  const month = d.toLocaleDateString('es-CL', { month: 'long' });
  const day = d.getDate();
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${day} de ${month}`;
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
  return now.getHours() * 60 + now.getMinutes() > h * 60 + m + 10;
}

export default function VetDashboardScreen() {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [monthlyAll, setMonthlyAll] = useState<Appointment[]>([]);
  const [vetProfile, setVetProfile] = useState<Veterinarian | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [newNotifCount, setNewNotifCount] = useState(0);
  const [filterFrom, setFilterFrom] = useState<string | null>(null);
  const [filterTo, setFilterTo] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showFromCalendar, setShowFromCalendar] = useState(false);
  const [showToCalendar, setShowToCalendar] = useState(false);
  const today = new Date();

  // Listen for new-appointment notifications from RTDB
  useEffect(() => {
    if (!user) return;
    const notifRef = ref(rtdb, `${RTDB_PATHS.NOTIFICATIONS}/${user.uid}`);
    onValue(notifRef, (snap) => {
      const data = snap.val();
      if (!data) { setNewNotifCount(0); return; }
      const unread = Object.values(data as Record<string, any>).filter((n) => !n.read).length;
      setNewNotifCount(unread);
      if (unread > 0) {
        // Reload appointments so the new booking is visible
        loadData();
      }
    });
    return () => off(notifRef);
  }, [user?.uid]);

  async function loadData() {
    if (!user) return;
    const vetSnap = await getDocs(
      query(collection(db, COLLECTIONS.VETERINARIANS), where('userId', '==', user.uid))
    );
    if (!vetSnap.empty) {
      const vet = { id: vetSnap.docs[0].id, ...vetSnap.docs[0].data() } as Veterinarian;
      setVetProfile(vet);

      const todayStr = today.toISOString().slice(0, 10);
      const monthPrefix = todayStr.slice(0, 7); // 'YYYY-MM'

      try {
        const apptSnap = await getDocs(
          query(collection(db, COLLECTIONS.APPOINTMENTS), where('vetId', '==', vet.id))
        );
        const all = apptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Appointment));

        // Upcoming list: pending/confirmed/arrived/completed from today onwards
        const activeStatuses = ['pending', 'confirmed', 'arrived', 'completed'];
        const upcoming = all
          .filter((a) => activeStatuses.includes(a.status) && (a.date ?? '') >= todayStr)
          .sort((a, b) =>
            (a.date ?? '').localeCompare(b.date ?? '') ||
            (a.time ?? '').localeCompare(b.time ?? '')
          );
        setAppointments(upcoming);

        // Monthly stats: all appointments this month (any status)
        const monthly = all.filter((a) => (a.date ?? '').startsWith(monthPrefix));
        setMonthlyAll(monthly);
      } catch {
        setAppointments([]);
        setMonthlyAll([]);
      }
    }
  }

  // Reload every time the screen comes into focus (e.g. after cancelling an appointment)
  useFocusEffect(
    useCallback(() => {
      loadData().catch(() => {});
    }, [user])
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadData().catch(() => {});
    setRefreshing(false);
  }

  const todayStr = today.toISOString().slice(0, 10);
  const monthName = today.toLocaleDateString('es-CL', { month: 'long' });
  const fee = vetProfile?.consultationFee || 0;

  const todayAppts = appointments.filter((a) => a.date === todayStr);
  const upcomingAppts = appointments.filter((a) => (a.date ?? '') > todayStr);
  const pendingCount = appointments.filter((a) => ['pending', 'confirmed'].includes(a.status)).length;

  // Date-range filter over the same upcoming/active appointment list —
  // when active it replaces the Hoy/Próximas split with one combined result.
  const dateFilterActive = !!(filterFrom || filterTo);
  const filteredAppts = dateFilterActive
    ? appointments
        .filter((a) => (!filterFrom || (a.date ?? '') >= filterFrom) && (!filterTo || (a.date ?? '') <= filterTo))
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.time ?? '').localeCompare(b.time ?? ''))
    : [];

  // Monthly KPIs (exclude cancelled)
  const monthActive = monthlyAll.filter((a) => a.status !== 'cancelled');
  const monthConfirmed = monthlyAll.filter((a) => ['confirmed', 'arrived', 'completed'].includes(a.status));
  const monthTotalAmount = monthActive.length * fee;
  const monthConfirmedAmount = monthConfirmed.length * fee;

  const isPending = vetProfile?.status === 'pending';
  const createdAtMs = vetProfile?.createdAt ? new Date(vetProfile.createdAt).getTime() : 0;
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const isTempActive = createdAtMs > 0 && Date.now() - createdAtMs < ninetyDaysMs;
  const daysRemaining = createdAtMs > 0
    ? Math.max(0, Math.ceil((createdAtMs + ninetyDaysMs - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  if (isPending && !isTempActive) {
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
      {isPending && isTempActive && (
        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16 }}>⏳</Text>
          <Text style={{ flex: 1, color: '#92400E', fontSize: 12, fontWeight: '600' }}>
            Cuenta en revisión — acceso provisional por {daysRemaining} días más
          </Text>
        </View>
      )}

      {/* Header */}
      <View style={{ backgroundColor: '#1B4332' }} className="px-5 pt-4 pb-6">
        <Text className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">
          Agenda del día
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
              <Text className="text-white text-xs font-semibold">Disponibilidad</Text>
            </TouchableOpacity>
            {newNotifCount > 0 && (
              <TouchableOpacity
                style={{ backgroundColor: '#EF4444' }}
                className="rounded-full px-3 py-1.5"
                onPress={() => {
                  // Mark all notifications as read and reload
                  if (user) remove(ref(rtdb, `${RTDB_PATHS.NOTIFICATIONS}/${user.uid}`)).catch(() => {});
                  setNewNotifCount(0);
                  loadData();
                }}
              >
                <Text className="text-white text-xs font-bold">🔔 {newNotifCount} nueva{newNotifCount !== 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            )}
            {pendingCount > 0 && (
              <View style={{ backgroundColor: '#52B788' }} className="rounded-full px-3 py-1.5">
                <Text className="text-white text-xs font-bold">{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {/* Welcome banner */}
        <View style={{ backgroundColor: '#2D6A4F' }} className="mx-4 -mt-2 rounded-2xl p-5 shadow-md">
          <Text className="text-white text-base font-bold leading-snug">
            Bienvenido/a 👋
          </Text>
          <Text className="text-white/80 text-sm mt-1">
            {todayAppts.length > 0
              ? `Tienes ${todayAppts.length} cita${todayAppts.length !== 1 ? 's' : ''} para hoy`
              : 'No hay citas programadas para hoy'}
          </Text>
          {todayAppts.length > 0 && (
            <TouchableOpacity
              style={{ backgroundColor: '#52B788' }}
              className="mt-4 self-start flex-row items-center rounded-full px-5 py-2.5 gap-1.5"
              onPress={() => router.push(`/(vet)/appointment/${todayAppts[0].id}` as any)}
            >
              <Text className="text-white font-semibold text-sm">Ver primera cita</Text>
              <Text className="text-white text-xs">▶</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── KPI Cards ── */}
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 20 }}>
          {/* Total reservas del mes */}
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}>
            <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Reservas {monthName}
            </Text>
            <Text style={{ color: '#1B4332', fontSize: 26, fontWeight: '800' }}>
              {monthActive.length}
            </Text>
            <Text style={{ color: '#2D6A4F', fontSize: 16, fontWeight: '700', marginTop: 2 }}>
              ${monthTotalAmount.toLocaleString('es-CL')}
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 4 }}>
              Total del mes
            </Text>
          </View>

          {/* Reservas confirmadas del mes */}
          <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#BFDBFE', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}>
            <Text style={{ color: '#1D4ED8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Confirmadas
            </Text>
            <Text style={{ color: '#1E3A8A', fontSize: 26, fontWeight: '800' }}>
              {monthConfirmed.length}
            </Text>
            <Text style={{ color: '#1D4ED8', fontSize: 16, fontWeight: '700', marginTop: 2 }}>
              ${monthConfirmedAmount.toLocaleString('es-CL')}
            </Text>
            <Text style={{ color: '#60A5FA', fontSize: 11, marginTop: 4 }}>
              Confirmadas / en curso
            </Text>
          </View>
        </View>

        {/* ── Filtro por rango de fechas ── */}
        <View className="px-4 mt-6">
          <TouchableOpacity
            onPress={() => setShowFilter((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: showFilter ? 10 : 0 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#2D6A4F' }}>
              🔍 Buscar por rango de fechas
            </Text>
            <Text style={{ fontSize: 11, color: '#94A3B8' }}>{showFilter ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showFilter && (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setShowFromCalendar((v) => !v); setShowToCalendar(false); }}
                  style={{ flex: 1, borderWidth: 1, borderColor: filterFrom ? '#2D6A4F' : '#E2E8F0', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}
                >
                  <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>DESDE</Text>
                  <Text style={{ fontSize: 13, color: filterFrom ? '#1F2937' : '#9CA3AF', fontWeight: '600', marginTop: 2 }}>
                    {filterFrom || 'Cualquiera'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowToCalendar((v) => !v); setShowFromCalendar(false); }}
                  style={{ flex: 1, borderWidth: 1, borderColor: filterTo ? '#2D6A4F' : '#E2E8F0', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}
                >
                  <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>HASTA</Text>
                  <Text style={{ fontSize: 13, color: filterTo ? '#1F2937' : '#9CA3AF', fontWeight: '600', marginTop: 2 }}>
                    {filterTo || 'Cualquiera'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showFromCalendar && (
                <View style={{ marginTop: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <YearCalendar
                    onDayPress={(day) => { setFilterFrom(day.dateString); setShowFromCalendar(false); }}
                    minDate={todayStr}
                    initialDate={filterFrom || todayStr}
                    markedDates={filterFrom ? { [filterFrom]: { selected: true, selectedColor: '#2D6A4F' } } : {}}
                  />
                </View>
              )}
              {showToCalendar && (
                <View style={{ marginTop: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <YearCalendar
                    onDayPress={(day) => { setFilterTo(day.dateString); setShowToCalendar(false); }}
                    minDate={filterFrom || todayStr}
                    initialDate={filterTo || filterFrom || todayStr}
                    markedDates={filterTo ? { [filterTo]: { selected: true, selectedColor: '#2D6A4F' } } : {}}
                  />
                </View>
              )}

              {dateFilterActive && (
                <TouchableOpacity
                  onPress={() => { setFilterFrom(null); setFilterTo(null); }}
                  style={{ marginTop: 10, alignSelf: 'flex-start' }}
                >
                  <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '700' }}>✕ Limpiar filtro</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {dateFilterActive ? (
          <View className="px-4 mt-4">
            <Text className="text-gray-500 font-semibold text-xs mb-3 uppercase tracking-widest">
              Resultados {filterFrom || '…'} → {filterTo || '…'} ({filteredAppts.length})
            </Text>
            {filteredAppts.length === 0 ? (
              <View className="bg-white rounded-2xl p-8 items-center border border-gray-100 shadow-sm mb-4">
                <Text className="text-4xl mb-2">📅</Text>
                <Text className="text-gray-500 text-sm">No hay citas en ese rango de fechas</Text>
              </View>
            ) : (
              <View className="gap-3 mb-8">
                {filteredAppts.map((appt) => (
                  <TouchableOpacity
                    key={appt.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-row overflow-hidden"
                    style={{ borderLeftWidth: 4, borderLeftColor: '#3B82F6' }}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/(vet)/appointment/${appt.id}` as any)}
                  >
                    <View className="flex-1 flex-row items-center px-4 py-4 gap-3">
                      <View className="bg-blue-50 rounded-full w-12 h-12 items-center justify-center">
                        <Text className="text-2xl">🐕</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-blue-500">
                          {appt.date} · {formatTime(appt.time || '00:00')}
                        </Text>
                        <Text className="text-gray-800 font-semibold text-base leading-tight mt-0.5">
                          Consulta veterinaria
                        </Text>
                        <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
                          {(appt as any).reason || '—'}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: appt.status === 'confirmed' ? '#DCFCE7' : '#FEF9C3', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: appt.status === 'confirmed' ? '#16A34A' : '#92400E' }}>
                          {appt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
        <View className="px-4 mt-6">
          <Text className="text-gray-500 font-semibold text-xs mb-3 uppercase tracking-widest">
            Hoy — {today.toLocaleDateString('es-CL', { month: 'short', day: 'numeric' })}
          </Text>

          {todayAppts.length === 0 ? (
            <View className="bg-white rounded-2xl p-8 items-center border border-gray-100 shadow-sm mb-4">
              <Text className="text-4xl mb-2">📅</Text>
              <Text className="text-gray-500 text-sm">No hay citas programadas hoy</Text>
            </View>
          ) : (
            <View className="gap-3 mb-4">
              {todayAppts.map((appt) => {
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
                      <View className="bg-gray-100 rounded-full w-12 h-12 items-center justify-center">
                        <Text className="text-2xl">🐕</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold" style={{ color: timeColor }}>
                          {formatTime(appt.time || '00:00')}
                        </Text>
                        <Text className="text-gray-800 font-semibold text-base leading-tight mt-0.5">
                          Consulta veterinaria
                        </Text>
                        <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
                          {(appt as any).reason || '—'}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: appt.status === 'confirmed' ? '#DCFCE7' : '#FEF9C3', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: appt.status === 'confirmed' ? '#16A34A' : '#92400E' }}>
                          {appt.status === 'confirmed' ? 'Confirmada' : appt.status === 'pending' ? 'Pendiente' : appt.status}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Próximas citas ── */}
          {upcomingAppts.length > 0 && (
            <>
              <Text className="text-gray-500 font-semibold text-xs mb-3 uppercase tracking-widest">
                Próximas citas
              </Text>
              <View className="gap-3 mb-8">
                {upcomingAppts.map((appt) => (
                  <TouchableOpacity
                    key={appt.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-row overflow-hidden"
                    style={{ borderLeftWidth: 4, borderLeftColor: '#3B82F6' }}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/(vet)/appointment/${appt.id}` as any)}
                  >
                    <View className="flex-1 flex-row items-center px-4 py-4 gap-3">
                      <View className="bg-blue-50 rounded-full w-12 h-12 items-center justify-center">
                        <Text className="text-2xl">🐕</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-blue-500">
                          {appt.date} · {formatTime(appt.time || '00:00')}
                        </Text>
                        <Text className="text-gray-800 font-semibold text-base leading-tight mt-0.5">
                          Consulta veterinaria
                        </Text>
                        <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
                          {(appt as any).reason || '—'}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: appt.status === 'confirmed' ? '#DCFCE7' : '#FEF9C3', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: appt.status === 'confirmed' ? '#16A34A' : '#92400E' }}>
                          {appt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {appointments.length === 0 && (
            <View className="bg-white rounded-2xl p-10 items-center border border-gray-100 mb-8">
              <Text className="text-4xl mb-3">🗓️</Text>
              <Text className="text-gray-500 text-sm text-center">No tienes citas próximas programadas</Text>
            </View>
          )}
        </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
