import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Groomer } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#9333EA';

const STATUS_INFO: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: '⏳ Cuenta en revisión — te notificaremos pronto', color: '#92400E', bg: '#FEF3C7' },
  approved: { text: '✅ Cuenta aprobada — estás activo', color: '#065F46', bg: '#D1FAE5' },
  rejected: { text: '❌ Cuenta rechazada — contacta a soporte', color: '#991B1B', bg: '#FEE2E2' },
};

const BOOKING_STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: '⏳ Pendiente',  color: '#D97706', bg: '#FFFBEB' },
  confirmed: { label: '✅ Confirmada', color: '#059669', bg: '#ECFDF5' },
  completed: { label: '🏆 Completada', color: '#6B7280', bg: '#F3F4F6' },
  cancelled: { label: '❌ Cancelada',  color: '#EF4444', bg: '#FEF2F2' },
};

function InfoRow({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
      <Text style={{ color: '#6B7280', fontSize: 13, width: 120 }}>{label}</Text>
      <Text style={{ color: '#1E293B', fontWeight: '600', fontSize: 13, flex: 1 }}>{value}</Text>
    </View>
  );
}

export default function GroomingDashboard() {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [groomer, setGroomer] = useState<Groomer | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.GROOMERS, user.uid));
      if (snap.exists()) {
        const g = { id: snap.id, ...snap.data() } as Groomer;
        setGroomer(g);
        const bSnap = await getDocs(query(collection(db, COLLECTIONS.APPOINTMENTS), where('vetId', '==', g.id)));
        const all = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        all.sort((a: any, b: any) => b.createdAt?.localeCompare(a.createdAt));
        setBookings(all);
      }
    } catch {}
  }

  useFocusEffect(useCallback(() => { loadData(); }, [user?.uid]));

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  function confirmLogout() {
    Alert.alert('Cerrar sesión', '¿Seguro que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logOut },
    ]);
  }

  const statusInfo = STATUS_INFO[groomer?.status ?? 'pending'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF5FF' }} edges={['top']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#581C87' }}>✂️ Panel de Peluquería</Text>
          <Text style={{ color: '#4B5563', marginTop: 4 }}>Hola, {user?.name?.split(' ')[0] || 'Peluquero/a'}</Text>
        </View>

        {/* Status banner */}
        <View style={{ backgroundColor: statusInfo.bg, borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <Text style={{ color: statusInfo.color, fontWeight: '700', fontSize: 14 }}>{statusInfo.text}</Text>
          {groomer?.status === 'pending' && (
            <Text style={{ color: statusInfo.color, fontSize: 12, marginTop: 4 }}>
              Una vez aprobado, los dueños podrán ver tu perfil y contactarte.
            </Text>
          )}
        </View>

        {/* Service card */}
        {groomer && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
            <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, marginBottom: 12 }}>Mi servicio</Text>
            <InfoRow emoji="📍" label="Ciudad" value={`${groomer.city}, ${groomer.region}`} />
            <InfoRow emoji="🏠" label="Modalidad" value={groomer.serviceType === 'home' ? 'A domicilio' : 'En tienda'} />
            <InfoRow emoji="✂️" label="Servicios" value={groomer.services?.join(', ') || '—'} />
            <InfoRow
              emoji="💰"
              label="Valor desde"
              value={groomer.fee ? `$${Number(groomer.fee).toLocaleString('es-CL')} CLP` : 'Sin definir — actualiza tu perfil'}
            />
            {groomer.rating != null && (
              <InfoRow emoji="⭐" label="Calificación" value={`${Number(groomer.rating).toFixed(1)} / 5 (${groomer.reviewCount ?? 0} reseñas)`} />
            )}
          </View>
        )}

        {/* Bookings */}
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 10 }}>Próximas reservas</Text>
        {bookings.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 24, marginBottom: 16 }}>
            <Text style={{ fontSize: 32, marginBottom: 6 }}>🐾</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Sin reservas agendadas aún</Text>
          </View>
        ) : (
          <View style={{ gap: 10, marginBottom: 16 }}>
            {bookings.map((b: any) => {
              const st = BOOKING_STATUS_LABEL[b.status] || BOOKING_STATUS_LABEL.pending;
              return (
                <View key={b.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{b.date} · {b.time}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{b.reason || 'Servicio de peluquería'}</Text>
                    </View>
                    <View style={{ backgroundColor: st.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: st.color, fontSize: 11, fontWeight: '600' }}>{st.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity
          style={{ backgroundColor: PURPLE, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 12 }}
          onPress={() => router.navigate('/(grooming)/profile' as any)}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Editar perfil y tarifas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' }}
          onPress={confirmLogout}
        >
          <Text style={{ color: '#EF4444', fontWeight: '600' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
