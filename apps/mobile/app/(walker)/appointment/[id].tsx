import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { initFirebase, COLLECTIONS, RTDB_PATHS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { logAppointmentCompleted, logAppointmentCancelled } from '../../../lib/analytics';
import type { Appointment, Pet, Walker } from '@junglapp/types';

function appointmentCategory(type: string | undefined): 'walker' | 'groomer' | 'trainer' {
  if (type === 'grooming') return 'groomer';
  if (type === 'training') return 'trainer';
  return 'walker';
}

const { db, rtdb } = initFirebase();

const GREEN = '#2D6A4F';
const BORDER = '#E2E8F0';
const DARK = '#1E293B';
const GRAY = '#64748B';
const RED = '#EF4444';
const PRIMARY = '#1D4ED8';

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', confirmed: '#16A34A', completed: '#64748B', cancelled: '#EF4444',
};
const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Pendiente de confirmación',
  confirmed: '✅ Confirmada',
  completed: '✔️ Completada',
  cancelled: '❌ Cancelada',
};

export default function WalkerAppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [walkerProfile, setWalkerProfile] = useState<Walker | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    loadAll();
  }, [id, user]);

  async function loadAll() {
    setLoading(true);
    try {
      const wSnap = await getDoc(doc(db, COLLECTIONS.WALKERS, user!.uid));
      if (!wSnap.exists()) {
        Alert.alert('Error', 'No se encontró tu perfil de paseador.');
        router.canGoBack() ? router.back() : router.replace('/(walker)' as any);
        return;
      }
      const walker = { id: wSnap.id, ...wSnap.data() } as Walker;
      setWalkerProfile(walker);

      const apptSnap = await getDoc(doc(db, COLLECTIONS.APPOINTMENTS, id!));
      if (!apptSnap.exists()) {
        Alert.alert('Error', 'Reserva no encontrada.');
        router.canGoBack() ? router.back() : router.replace('/(walker)' as any);
        return;
      }
      const appt = { id: apptSnap.id, ...apptSnap.data() } as Appointment;

      if (appt.vetId !== walker.id) {
        Alert.alert('No autorizado', 'Esta reserva no te pertenece.');
        router.replace('/(walker)' as any);
        return;
      }

      setAppointment(appt);

      // Self-heal: reservas creadas antes de que existiera el registro
      // clientLinks (o si esa escritura falló) no tendrían el vínculo que
      // exige la regla de lectura de `users/{uid}` — lo recreamos acá para
      // que el perfil del dueño no falle en silencio más abajo. Debe usar
      // el UID de auth del paseador (user.uid), no el ID del documento
      // walkers (walker.id) — la regla de lectura chequea request.auth.uid.
      try {
        const linkRef = doc(db, COLLECTIONS.CLIENT_LINKS, `${user!.uid}_${appt.ownerId}`);
        const linkSnap = await getDoc(linkRef);
        if (!linkSnap.exists()) {
          await setDoc(linkRef, {
            professionalId: user!.uid,
            ownerId: appt.ownerId,
            createdAt: new Date().toISOString(),
          });
        }
      } catch {}

      // La mascota se carga aparte del perfil del dueño: el paseador no
      // tiene acceso garantizado a `pets` por rol (a diferencia del vet), así
      // que igual puede fallar, pero no debe bloquear que se muestre si el
      // perfil del dueño falla (o viceversa).
      if (appt.petId) {
        try {
          const petSnap = await getDoc(doc(db, COLLECTIONS.PETS, appt.petId));
          if (petSnap.exists()) setPet({ id: petSnap.id, ...petSnap.data() } as Pet);
        } catch {}
      }
      try {
        const ownerSnap = await getDoc(doc(db, 'users', appt.ownerId));
        if (ownerSnap.exists()) setOwnerProfile({ id: ownerSnap.id, ...ownerSnap.data() });
      } catch {}
    } catch (e: any) {
      Alert.alert('Error cargando reserva', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(newStatus: string, extra?: Record<string, any>) {
    if (!id || !appointment) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.APPOINTMENTS, id), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        ...extra,
      });
      const category = appointmentCategory((appointment as any).type);
      if (newStatus === 'completed') logAppointmentCompleted(category);
      if (newStatus === 'cancelled') logAppointmentCancelled(category);
      setAppointment((p) => p ? { ...p, status: newStatus as any, ...extra } : null);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmReject() {
    Alert.alert('Rechazar reserva', '¿Seguro que deseas rechazar esta reserva?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, rechazar', style: 'destructive', onPress: () => changeStatus('cancelled', { cancelledBy: 'walker' }) },
    ]);
  }

  function confirmComplete() {
    Alert.alert('Marcar como completada', '¿El paseo/cuidado ya se realizó?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, completar', onPress: () => changeStatus('completed') },
    ]);
  }

  async function openChat() {
    if (!user || !appointment) return;
    setOpeningChat(true);
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.CHATS), where('participants', 'array-contains', user.uid))
      );
      const existing = snap.docs.find((d) =>
        (d.data().participants as string[]).includes(appointment.ownerId)
      );

      let chatId: string;
      if (existing) {
        chatId = existing.id;
      } else {
        const ownerName = ownerProfile?.name || ownerProfile?.displayName || 'Dueño';
        const walkerName = walkerProfile?.name || user.name || 'Paseador';
        const newChat = await addDoc(collection(db, COLLECTIONS.CHATS), {
          participants: [user.uid, appointment.ownerId],
          participantNames: { [user.uid]: walkerName, [appointment.ownerId]: ownerName },
          chatType: 'walker',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        chatId = newChat.id;
      }

      await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatId}/${user.uid}`), true);
      await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatId}/${appointment.ownerId}`), true);

      router.push(`/(walker)/chat/${chatId}` as any);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el chat');
    } finally {
      setOpeningChat(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={GREEN} size="large" />
      </SafeAreaView>
    );
  }

  if (!appointment) return null;

  const status = appointment.status;
  const isPending = status === 'pending';
  const isConfirmed = status === 'confirmed';
  const isCancelled = status === 'cancelled';
  const isCompleted = status === 'completed';
  const canModify = isPending || isConfirmed;
  const isCare = (appointment as any).type === 'pet_care';
  const statusColor = STATUS_COLORS[status] ?? GRAY;
  const statusLabel = STATUS_LABELS[status] ?? status;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <ScrollView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ backgroundColor: GREEN, paddingTop: 16, paddingBottom: 28, paddingHorizontal: 20 }}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(walker)' as any)}
            style={{ marginBottom: 16 }}
          >
            <Text style={{ color: '#A7F3D0', fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 }}>
            {isCare ? 'Detalle de Cuidado 🏠' : 'Detalle de Paseo 🦮'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#D1FAE5', fontSize: 14 }}>
              {appointment.date}  ·  {appointment.time}
            </Text>
            <View style={{ backgroundColor: statusColor + '30', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: statusColor + '60' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>{statusLabel}</Text>
            </View>
          </View>
          {(appointment as any).reason && (
            <Text style={{ color: '#6EE7B7', fontSize: 13, marginTop: 6 }}>
              Notas: {(appointment as any).reason}
            </Text>
          )}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>

          {/* Cancelled notice */}
          {isCancelled && (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' }}>
              <Text style={{ color: RED, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>❌ Reserva cancelada</Text>
              <Text style={{ color: '#DC2626', fontSize: 13 }}>
                {(appointment as any).cancelledBy === 'owner'
                  ? 'El dueño canceló esta reserva.'
                  : 'Rechazaste esta reserva.'}
              </Text>
            </View>
          )}

          {/* Completed notice */}
          {isCompleted && (
            <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0' }}>
              <Text style={{ color: GREEN, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>✅ Servicio completado</Text>
              <Text style={{ color: '#047857', fontSize: 13 }}>Este paseo/cuidado fue marcado como realizado.</Text>
            </View>
          )}

          {/* ── Dueño ── */}
          <Text style={{ fontWeight: '700', color: DARK, fontSize: 15, marginBottom: 10 }}>Dueño de la mascota</Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: BORDER }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 26 }}>👤</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: DARK, fontSize: 16 }}>
                  {ownerProfile?.name || ownerProfile?.displayName || 'Usuario'}
                </Text>
                <Text style={{ color: GRAY, fontSize: 13 }}>{ownerProfile?.email || ''}</Text>
              </View>
            </View>

            {ownerProfile?.phone ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                <View>
                  <Text style={{ color: GRAY, fontSize: 12 }}>Teléfono</Text>
                  <Text style={{ color: DARK, fontSize: 14, fontWeight: '600' }}>{ownerProfile.phone}</Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: '#ECFDF5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  onPress={() => Linking.openURL(`tel:${ownerProfile.phone}`)}
                >
                  <Text style={{ fontSize: 16 }}>📞</Text>
                  <Text style={{ color: GREEN, fontWeight: '700', fontSize: 13 }}>Llamar</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {ownerProfile?.address ? (
              <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                <Text style={{ color: GRAY, fontSize: 12 }}>Dirección</Text>
                <Text style={{ color: DARK, fontSize: 14 }}>{ownerProfile.address}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={{ marginTop: 8, backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: openingChat ? 0.6 : 1 }}
              onPress={openChat}
              disabled={openingChat}
            >
              {openingChat ? <ActivityIndicator size="small" color={PRIMARY} /> : <Text style={{ fontSize: 16 }}>💬</Text>}
              <Text style={{ color: PRIMARY, fontWeight: '700', fontSize: 14 }}>
                {openingChat ? 'Abriendo chat...' : 'Enviar mensaje'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Mascota ── */}
          {pet && (
            <>
              <Text style={{ fontWeight: '700', color: DARK, fontSize: 15, marginBottom: 10 }}>Mascota</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: BORDER }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {pet.photos?.[0] ? (
                    <Image source={{ uri: pet.photos[0] }} style={{ width: 56, height: 56, borderRadius: 12 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 28 }}>{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: DARK, fontSize: 16 }}>{pet.name}</Text>
                    <Text style={{ color: GRAY, fontSize: 13 }}>{pet.breed} · {pet.color}</Text>
                    {pet.weight != null ? <Text style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>Peso: {pet.weight} kg</Text> : null}
                  </View>
                </View>
                {pet.allergic && (
                  <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FECACA', marginTop: 10 }}>
                    <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '700' }}>⚠️ Alérgico/a — declarado por el dueño</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {/* ── Botones de acción ── */}
          {canModify && (
            <View style={{ gap: 12, marginBottom: 40 }}>
              {isPending && (
                <>
                  <TouchableOpacity
                    style={{ backgroundColor: saving ? '#86efac' : GREEN, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                    onPress={() => changeStatus('confirmed')}
                    disabled={saving}
                  >
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 18 }}>✅</Text>}
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Aceptar reserva</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                    onPress={confirmReject}
                    disabled={saving}
                  >
                    <Text style={{ color: RED, fontWeight: '700', fontSize: 15 }}>❌ Rechazar reserva</Text>
                  </TouchableOpacity>
                </>
              )}

              {isConfirmed && (
                <>
                  <TouchableOpacity
                    style={{ backgroundColor: saving ? '#86efac' : GREEN, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                    onPress={confirmComplete}
                    disabled={saving}
                  >
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 18 }}>🏆</Text>}
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Marcar como completada</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                    onPress={confirmReject}
                    disabled={saving}
                  >
                    <Text style={{ color: RED, fontWeight: '700', fontSize: 15 }}>❌ Cancelar reserva</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {(isCancelled || isCompleted) && (
            <TouchableOpacity
              style={{ backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 40 }}
              onPress={() => router.canGoBack() ? router.back() : router.replace('/(walker)' as any)}
            >
              <Text style={{ color: GRAY, fontWeight: '700' }}>Volver</Text>
            </TouchableOpacity>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
