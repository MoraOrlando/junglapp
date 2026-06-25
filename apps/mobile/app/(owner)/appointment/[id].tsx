import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { initFirebase, COLLECTIONS, RTDB_PATHS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Appointment, Pet, Veterinarian } from '@junglapp/types';

const { db, rtdb } = initFirebase();

const GREEN = '#2D6A4F';
const BORDER = '#E2E8F0';
const DARK = '#1E293B';
const GRAY = '#64748B';
const RED = '#EF4444';
const PRIMARY = '#1D4ED8';

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', confirmed: '#16A34A', arrived: '#8B5CF6',
  completed: '#64748B', cancelled: '#EF4444',
};
const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Pendiente de confirmación',
  confirmed: '✅ Confirmada',
  arrived: '📍 Veterinario en camino',
  completed: '✔️ Completada',
  cancelled: '❌ Cancelada',
};

export default function OwnerAppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [vet, setVet] = useState<Veterinarian | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    loadAll();
  }, [id, user]);

  async function loadAll() {
    setLoading(true);
    try {
      const apptSnap = await getDoc(doc(db, COLLECTIONS.APPOINTMENTS, id!));
      if (!apptSnap.exists()) {
        Alert.alert('Error', 'Cita no encontrada.');
        router.back();
        return;
      }
      const appt = { id: apptSnap.id, ...apptSnap.data() } as Appointment;

      if (appt.ownerId !== user!.uid) {
        Alert.alert('No autorizado', 'Esta cita no te pertenece.');
        router.replace('/(owner)' as any);
        return;
      }

      setAppointment(appt);

      const [petSnap, vetSnap] = await Promise.all([
        getDoc(doc(db, COLLECTIONS.PETS, appt.petId)),
        getDoc(doc(db, COLLECTIONS.VETERINARIANS, appt.vetId)),
      ]);
      if (petSnap.exists()) setPet({ id: petSnap.id, ...petSnap.data() } as Pet);
      if (vetSnap.exists()) setVet({ id: vetSnap.id, ...vetSnap.data() } as Veterinarian);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  function confirmCancel() {
    Alert.alert(
      'Cancelar cita',
      '¿Estás seguro/a de que deseas cancelar esta cita?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await updateDoc(doc(db, COLLECTIONS.APPOINTMENTS, id!), {
                status: 'cancelled',
                cancelledBy: 'owner',
                updatedAt: new Date().toISOString(),
              });
              setAppointment((p) => p ? { ...p, status: 'cancelled' as any } : null);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  }

  async function openChat() {
    if (!user || !appointment || !vet) return;
    setOpeningChat(true);
    try {
      // Find or create chat between owner and vet
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.CHATS), where('participants', 'array-contains', user.uid))
      );
      const existing = snap.docs.find((d) =>
        (d.data().participants as string[]).includes(vet.userId)
      );

      let chatId: string;
      if (existing) {
        chatId = existing.id;
      } else {
        const newChat = await addDoc(collection(db, COLLECTIONS.CHATS), {
          participants: [user.uid, vet.userId],
          participantNames: {
            [user.uid]: user.name || 'Dueño',
            [vet.userId]: vet.name || 'Veterinario',
          },
          chatType: 'vet',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        chatId = newChat.id;
      }

      // Register own entry first, then the other participant
      await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatId}/${user.uid}`), true);
      await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatId}/${vet.userId}`), true);

      router.push(`/(owner)/chat/${chatId}` as any);
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
  const isCancelled = status === 'cancelled';
  const isCompleted = status === 'completed';
  const canCancel = !isCancelled && !isCompleted;
  const statusColor = STATUS_COLORS[status] ?? GRAY;
  const statusLabel = STATUS_LABELS[status] ?? status;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <ScrollView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ backgroundColor: GREEN, paddingTop: 16, paddingBottom: 28, paddingHorizontal: 20 }}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(owner)' as any)}
            style={{ marginBottom: 16 }}
          >
            <Text style={{ color: '#A7F3D0', fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 }}>
            Mi Cita 📅
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
              Motivo: {(appointment as any).reason}
            </Text>
          )}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>

          {/* Cancelled notice */}
          {isCancelled && (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' }}>
              <Text style={{ color: RED, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>❌ Cita cancelada</Text>
              <Text style={{ color: '#DC2626', fontSize: 13 }}>
                {(appointment as any).cancelledBy === 'vet'
                  ? 'El veterinario canceló esta cita.'
                  : 'Cancelaste esta cita.'}
              </Text>
            </View>
          )}

          {/* Completed notice */}
          {isCompleted && (
            <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0' }}>
              <Text style={{ color: GREEN, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>✅ Consulta completada</Text>
              <Text style={{ color: '#047857', fontSize: 13 }}>La consulta fue realizada exitosamente.</Text>
            </View>
          )}

          {/* ── Veterinario ── */}
          {vet && (
            <>
              <Text style={{ fontWeight: '700', color: DARK, fontSize: 15, marginBottom: 10 }}>Veterinario</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: BORDER }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  {vet.photoUrl ? (
                    <Image source={{ uri: vet.photoUrl }} style={{ width: 60, height: 60, borderRadius: 30 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 28 }}>🩺</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: DARK, fontSize: 16 }}>{vet.name}</Text>
                    {vet.specialties?.length > 0 && (
                      <Text style={{ color: GRAY, fontSize: 13 }}>{vet.specialties.join(', ')}</Text>
                    )}
                    {vet.address ? (
                      <Text style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>📍 {vet.address}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Phone */}
                {vet.phone ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <View>
                      <Text style={{ color: GRAY, fontSize: 12 }}>Teléfono</Text>
                      <Text style={{ color: DARK, fontSize: 14, fontWeight: '600' }}>{vet.phone}</Text>
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: '#ECFDF5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                      onPress={() => Linking.openURL(`tel:${vet.phone}`)}
                    >
                      <Text style={{ fontSize: 16 }}>📞</Text>
                      <Text style={{ color: GREEN, fontWeight: '700', fontSize: 13 }}>Llamar</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Consultation fee */}
                {vet.consultationFee ? (
                  <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <Text style={{ color: GRAY, fontSize: 12 }}>Valor consulta</Text>
                    <Text style={{ color: DARK, fontSize: 14, fontWeight: '600' }}>
                      ${vet.consultationFee.toLocaleString('es-CL')} CLP
                    </Text>
                  </View>
                ) : null}

                {/* Message button */}
                <TouchableOpacity
                  style={{ marginTop: 10, backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: openingChat ? 0.6 : 1 }}
                  onPress={openChat}
                  disabled={openingChat}
                >
                  {openingChat ? <ActivityIndicator size="small" color={PRIMARY} /> : <Text style={{ fontSize: 16 }}>💬</Text>}
                  <Text style={{ color: PRIMARY, fontWeight: '700', fontSize: 14 }}>
                    {openingChat ? 'Abriendo chat...' : 'Enviar mensaje al veterinario'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

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
                    <Text style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>Nacimiento: {pet.birthDate}</Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* ── Cancelar ── */}
          {canCancel && (
            <TouchableOpacity
              style={{
                borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2',
                borderRadius: 16, paddingVertical: 16, alignItems: 'center',
                marginBottom: 16, opacity: cancelling ? 0.6 : 1,
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
              onPress={confirmCancel}
              disabled={cancelling}
            >
              {cancelling ? <ActivityIndicator size="small" color={RED} /> : <Text style={{ fontSize: 16 }}>❌</Text>}
              <Text style={{ color: RED, fontWeight: '700', fontSize: 15 }}>
                {cancelling ? 'Cancelando...' : 'Cancelar cita'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={{ backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 40 }}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(owner)' as any)}
          >
            <Text style={{ color: GRAY, fontWeight: '700' }}>Volver al inicio</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
