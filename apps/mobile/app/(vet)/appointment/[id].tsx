import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { initFirebase, COLLECTIONS, RTDB_PATHS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Appointment, Pet, Veterinarian } from '@junglapp/types';

const { db, rtdb } = initFirebase();

const PRIMARY = '#1D4ED8';
const GREEN = '#16A34A';
const BORDER = '#E2E8F0';
const DARK = '#1E293B';
const GRAY = '#64748B';
const RED = '#EF4444';

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', confirmed: '#3B82F6', arrived: '#8B5CF6',
  completed: '#16A34A', cancelled: '#EF4444',
};
const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Pendiente', confirmed: '✅ Confirmada', arrived: '📍 En consulta',
  completed: '✔️ Completada', cancelled: '❌ Cancelada',
};

const VISIT_REASON_ICONS: Record<string, string> = {
  Vacunas: '💉', Control: '🩺', Operación: '🔬', Otro: '📋',
};

interface MedicalVisit {
  id: string;
  date: string;
  visitReason: string;
  vetName: string;
  notes: string;
  prescriptionUrl?: string;
  nextControlDate?: string;
  createdAt: string;
}

export default function AppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [medicalVisits, setMedicalVisits] = useState<MedicalVisit[]>([]);
  const [ownerProfile, setOwnerProfile] = useState<any>(null);
  const [vetProfile, setVetProfile] = useState<Veterinarian | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    loadAll();
  }, [id, user]);

  async function loadAll() {
    setLoading(true);
    try {
      // Load vet profile first to get vet doc ID
      const vetSnap = await getDocs(
        query(collection(db, COLLECTIONS.VETERINARIANS), where('userId', '==', user!.uid))
      );
      if (vetSnap.empty) {
        Alert.alert('Error', 'No se encontró tu perfil de veterinario.');
        router.canGoBack() ? router.back() : router.replace('/(vet)' as any);
        return;
      }
      const vet = { id: vetSnap.docs[0].id, ...vetSnap.docs[0].data() } as Veterinarian;
      setVetProfile(vet);

      // Load appointment
      const apptSnap = await getDoc(doc(db, COLLECTIONS.APPOINTMENTS, id!));
      if (!apptSnap.exists()) {
        Alert.alert('Error', 'Cita no encontrada.');
        router.canGoBack() ? router.back() : router.replace('/(vet)' as any);
        return;
      }
      const appt = { id: apptSnap.id, ...apptSnap.data() } as Appointment;

      // Guard: appointment must belong to this vet (compare Firestore doc IDs)
      if (appt.vetId !== vet.id) {
        Alert.alert('No autorizado', 'Esta cita no te pertenece.');
        router.replace('/(vet)' as any);
        return;
      }

      setAppointment(appt);

      // Load pet, owner, and medical history in parallel
      const [petSnap, ownerSnap, visitsSnap] = await Promise.all([
        getDoc(doc(db, COLLECTIONS.PETS, appt.petId)),
        getDoc(doc(db, 'users', appt.ownerId)),
        getDocs(
          query(
            collection(db, COLLECTIONS.MEDICAL_VISITS),
            where('petId', '==', appt.petId),
            orderBy('createdAt', 'desc')
          )
        ).catch(() =>
          getDocs(query(collection(db, COLLECTIONS.MEDICAL_VISITS), where('petId', '==', appt.petId)))
        ),
      ]);

      if (petSnap.exists()) setPet({ id: petSnap.id, ...petSnap.data() } as Pet);
      if (ownerSnap.exists()) setOwnerProfile({ id: ownerSnap.id, ...ownerSnap.data() });
      const visits = visitsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as MedicalVisit))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      setMedicalVisits(visits);
    } catch (e: any) {
      Alert.alert('Error cargando cita', e.message);
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
      setAppointment((p) => p ? { ...p, status: newStatus as any, ...extra } : null);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmCancel() {
    Alert.alert(
      'Cancelar cita',
      '¿Quién cancela la cita?',
      [
        { text: 'Yo (veterinario)', style: 'destructive', onPress: () => changeStatus('cancelled', { cancelledBy: 'vet' }) },
        { text: 'El dueño de la mascota', onPress: () => changeStatus('cancelled', { cancelledBy: 'owner' }) },
        { text: 'No cancelar', style: 'cancel' },
      ]
    );
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
        const vetName = vetProfile?.name || user.name || 'Veterinario';
        const newChat = await addDoc(collection(db, COLLECTIONS.CHATS), {
          participants: [user.uid, appointment.ownerId],
          participantNames: { [user.uid]: vetName, [appointment.ownerId]: ownerName },
          chatType: 'vet',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        chatId = newChat.id;
      }

      // Write vet's own entry first (always allowed), then owner's entry
      // (allowed because vet is now a member of the chat)
      await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatId}/${user.uid}`), true);
      await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatId}/${appointment.ownerId}`), true);

      router.push(`/(vet)/chat/${chatId}` as any);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el chat');
    } finally {
      setOpeningChat(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={PRIMARY} size="large" />
      </SafeAreaView>
    );
  }

  if (!appointment) return null;

  const status = appointment.status;
  const isCancelled = status === 'cancelled';
  const isConfirmed = status === 'confirmed';
  const isCompleted = status === 'completed';
  const isPending = status === 'pending';
  const canModify = isPending || isConfirmed;
  const statusColor = STATUS_COLORS[status] ?? GRAY;
  const statusLabel = STATUS_LABELS[status] ?? status;

  const visitsToShow = showFullHistory ? medicalVisits : medicalVisits.slice(0, 3);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <ScrollView style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ backgroundColor: PRIMARY, paddingTop: 16, paddingBottom: 28, paddingHorizontal: 20 }}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(vet)' as any)} style={{ marginBottom: 16 }}>
            <Text style={{ color: '#BFDBFE', fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 }}>
            Detalle de Cita 🩺
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#BFDBFE', fontSize: 14 }}>
              {appointment.date}  ·  {appointment.time}
            </Text>
            <View style={{ backgroundColor: statusColor + '40', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{statusLabel}</Text>
            </View>
          </View>
          {(appointment as any).reason && (
            <Text style={{ color: '#93C5FD', fontSize: 13, marginTop: 6 }}>
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
                  ? 'Cancelada por el veterinario'
                  : (appointment as any).cancelledBy === 'owner'
                  ? 'Cancelada por el dueño de la mascota'
                  : 'Motivo no especificado'}
              </Text>
            </View>
          )}

          {/* ── Dueño ── */}
          <Text style={{ fontWeight: '700', color: DARK, fontSize: 15, marginBottom: 10 }}>Dueño de la mascota</Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: BORDER }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
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

          {/* ── Ficha de la mascota ── */}
          {pet && (
            <>
              <Text style={{ fontWeight: '700', color: DARK, fontSize: 15, marginBottom: 10 }}>
                Ficha médica — {pet.name}
              </Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: BORDER }}>

                {/* Datos básicos */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  {pet.photos?.[0] ? (
                    <Image source={{ uri: pet.photos[0] }} style={{ width: 72, height: 72, borderRadius: 14 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 72, height: 72, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 36 }}>{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: DARK, fontSize: 18 }}>{pet.name}</Text>
                    <Text style={{ color: GRAY, fontSize: 13 }}>{pet.breed} · {pet.color}</Text>
                    <Text style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>Nacimiento: {pet.birthDate}</Text>
                    {pet.chipNumber ? <Text style={{ color: GRAY, fontSize: 12 }}>Chip: {pet.chipNumber}</Text> : null}
                  </View>
                </View>

                {/* Condiciones */}
                {(pet.medicalRecord as any).conditions?.length > 0 && (
                  <View style={{ backgroundColor: '#FFF7ED', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FED7AA', marginBottom: 10 }}>
                    <Text style={{ color: '#C2410C', fontSize: 12, fontWeight: '700', marginBottom: 4 }}>🏥 Condiciones crónicas</Text>
                    {(pet.medicalRecord as any).conditions.map((c: string, i: number) => (
                      <Text key={i} style={{ color: '#9A3412', fontSize: 13 }}>• {c}</Text>
                    ))}
                  </View>
                )}

                {/* Alergias */}
                {pet.medicalRecord.allergies?.length > 0 && (
                  <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FECACA', marginBottom: 10 }}>
                    <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '700' }}>
                      ⚠️ Alergias: {pet.medicalRecord.allergies.join(', ')}
                    </Text>
                  </View>
                )}

                {/* Vacunas */}
                {pet.medicalRecord.vaccinations?.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={{ color: GRAY, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>💉 Vacunas registradas</Text>
                    {pet.medicalRecord.vaccinations.map((v, i) => (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                        <Text style={{ color: DARK, fontSize: 13 }}>{v.name}</Text>
                        <Text style={{ color: GRAY, fontSize: 12 }}>{v.date}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Notas del historial (texto libre) */}
                {pet.medicalRecord.notes ? (
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: BORDER }}>
                    <Text style={{ color: GRAY, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>📝 Notas médicas</Text>
                    <Text style={{ color: DARK, fontSize: 13, lineHeight: 20 }}>{pet.medicalRecord.notes}</Text>
                  </View>
                ) : null}
              </View>

              {/* ── Historial de visitas ── */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontWeight: '700', color: DARK, fontSize: 15 }}>
                  Historial de visitas ({medicalVisits.length})
                </Text>
                {medicalVisits.length > 3 && (
                  <TouchableOpacity onPress={() => setShowFullHistory((v) => !v)}>
                    <Text style={{ color: PRIMARY, fontSize: 13, fontWeight: '600' }}>
                      {showFullHistory ? 'Ver menos' : 'Ver todo'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {medicalVisits.length === 0 ? (
                <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: BORDER, alignItems: 'center' }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🏥</Text>
                  <Text style={{ color: GRAY, fontSize: 14 }}>Sin visitas médicas previas registradas</Text>
                </View>
              ) : (
                <View style={{ gap: 10, marginBottom: 20 }}>
                  {visitsToShow.map((visit) => (
                    <View key={visit.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 4, borderLeftColor: '#3B82F6' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 16 }}>{VISIT_REASON_ICONS[visit.visitReason] ?? '📋'}</Text>
                          <Text style={{ fontWeight: '700', color: DARK, fontSize: 14 }}>{visit.visitReason || 'Consulta'}</Text>
                        </View>
                        <Text style={{ color: GRAY, fontSize: 12 }}>{visit.date}</Text>
                      </View>

                      {visit.vetName ? (
                        <Text style={{ color: GRAY, fontSize: 12, marginBottom: 4 }}>🩺 {visit.vetName}</Text>
                      ) : null}

                      {visit.notes ? (
                        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, marginTop: 4 }}>
                          <Text style={{ color: DARK, fontSize: 13, lineHeight: 18 }}>{visit.notes}</Text>
                        </View>
                      ) : null}

                      {visit.nextControlDate ? (
                        <Text style={{ color: '#7C3AED', fontSize: 12, marginTop: 6 }}>
                          📅 Próximo control: {visit.nextControlDate}
                        </Text>
                      ) : null}

                      {visit.prescriptionUrl ? (
                        <TouchableOpacity
                          style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          onPress={() => Linking.openURL(visit.prescriptionUrl!)}
                        >
                          <Text style={{ fontSize: 14 }}>📄</Text>
                          <Text style={{ color: PRIMARY, fontSize: 12, fontWeight: '600' }}>Ver receta</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Estado: completada */}
          {isCompleted && (
            <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center' }}>
              <Text style={{ fontSize: 28, marginBottom: 4 }}>✅</Text>
              <Text style={{ fontWeight: '700', color: GREEN, fontSize: 15 }}>Consulta finalizada</Text>
            </View>
          )}

          {/* ── Botones de acción ── */}
          {canModify && (
            <View style={{ gap: 12, marginBottom: 40 }}>
              {isPending && (
                <TouchableOpacity
                  style={{ backgroundColor: saving ? '#93C5FD' : PRIMARY, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={() => changeStatus('confirmed')}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 18 }}>✅</Text>}
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Confirmar cita</Text>
                </TouchableOpacity>
              )}

              {isConfirmed && (
                <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center' }}>
                  <Text style={{ color: GREEN, fontWeight: '600', fontSize: 14 }}>✅ Cita confirmada</Text>
                </View>
              )}

              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                onPress={confirmCancel}
                disabled={saving}
              >
                <Text style={{ color: RED, fontWeight: '700', fontSize: 15 }}>❌ Cancelar cita</Text>
              </TouchableOpacity>
            </View>
          )}

          {(isCancelled || isCompleted) && (
            <TouchableOpacity
              style={{ backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 40 }}
              onPress={() => router.canGoBack() ? router.back() : router.replace('/(vet)' as any)}
            >
              <Text style={{ color: GRAY, fontWeight: '700' }}>Volver</Text>
            </TouchableOpacity>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
