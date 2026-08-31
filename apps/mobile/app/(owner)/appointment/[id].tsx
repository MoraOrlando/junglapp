import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, joinChat, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { VISIT_REASONS, VISIT_REASON_ICONS } from '../../../lib/visitReasons';
import type { Appointment, Pet, Veterinarian, Walker } from '@junglapp/types';

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)}>
          <Text style={{ fontSize: 28 }}>{star <= value ? '⭐' : '☆'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const { db } = initFirebase();

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
  const [walker, setWalker] = useState<Walker | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  // Whether the owner has already reviewed this vet (any past appointment,
  // not just this one) — mirrors (owner)/vets/[id].tsx's canReview, one
  // review per owner-vet relationship rather than per appointment.
  const [alreadyReviewed, setAlreadyReviewed] = useState<boolean | null>(null);

  // "Marcar como realizada" form (owner completing a vet appointment the
  // vet never completed themselves)
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [completeReason, setCompleteReason] = useState('');
  const [showReasonDropdown, setShowReasonDropdown] = useState(false);
  const [completeDiagnosis, setCompleteDiagnosis] = useState('');
  const [completeTreatment, setCompleteTreatment] = useState('');
  const [completePrescriptionUri, setCompletePrescriptionUri] = useState<string | null>(null);
  const [completeRating, setCompleteRating] = useState(0);
  const [completeComment, setCompleteComment] = useState('');
  const [completing, setCompleting] = useState(false);

  // "Calificar veterinario" form (appointment already completed, owner
  // hasn't reviewed yet)
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

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

      const isWalkerAppt = (appt as any).type === 'walk' || (appt as any).type === 'pet_care';
      const providerCollection = isWalkerAppt ? COLLECTIONS.WALKERS : COLLECTIONS.VETERINARIANS;

      const [petSnap, providerSnap] = await Promise.all([
        appt.petId ? getDoc(doc(db, COLLECTIONS.PETS, appt.petId)) : Promise.resolve(null),
        appt.vetId ? getDoc(doc(db, providerCollection, appt.vetId)) : Promise.resolve(null),
      ]);
      if (petSnap?.exists()) setPet({ id: petSnap.id, ...petSnap.data() } as Pet);
      if (providerSnap?.exists()) {
        if (isWalkerAppt) setWalker({ id: providerSnap.id, ...providerSnap.data() } as Walker);
        else setVet({ id: providerSnap.id, ...providerSnap.data() } as Veterinarian);
      }

      // REVIEWS.vetId is a generic provider-id field reused across vets and
      // walkers (see (owner)/walkers/[id].tsx's canReview) — one review per
      // owner-provider relationship, not per appointment, regardless of type.
      if (appt.vetId) {
        const reviewSnap = await getDocs(query(
          collection(db, COLLECTIONS.REVIEWS),
          where('vetId', '==', appt.vetId),
          where('ownerId', '==', user!.uid),
        )).catch(() => null);
        setAlreadyReviewed(reviewSnap ? !reviewSnap.empty : null);
      }
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

  function pickCompletePrescription() {
    Alert.alert('Subir receta', '¿Cómo quieres agregar la foto?', [
      {
        text: 'Cámara', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!result.canceled) setCompletePrescriptionUri(result.assets[0].uri);
        },
      },
      {
        text: 'Galería', onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
          if (!result.canceled) setCompletePrescriptionUri(result.assets[0].uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  // Owner marking a vet appointment as done themselves, for when the vet
  // never completed it through JunglApp — writes the same `consultation`
  // shape the vet-side flow writes (apps/mobile/app/(vet)/appointment/[id].tsx),
  // so it shows up in the pet's medical history the same way
  // (apps/mobile/app/(owner)/pets/[id].tsx already reads any completed
  // appointment's consultation, regardless of who wrote it).
  async function submitOwnerComplete() {
    const provider = vet ?? walker;
    // Walker completions skip the vet-specific reason/diagnosis fields —
    // only the free-text note (completeTreatment) is required, and it's
    // optional for a walk/care service.
    if (!isWalkerAppt && !completeReason) { Alert.alert('Faltan datos', 'Selecciona el motivo de la visita.'); return; }
    if (!isWalkerAppt && !completeTreatment.trim()) { Alert.alert('Faltan datos', 'Describe brevemente lo realizado en la consulta.'); return; }
    const needsReview = alreadyReviewed === false;
    if (needsReview && completeRating === 0) { Alert.alert('Faltan datos', `Por favor califica ${isWalkerAppt ? 'al paseador/cuidador' : 'al veterinario'}.`); return; }
    if (needsReview && !completeComment.trim()) { Alert.alert('Faltan datos', 'Escribe un comentario sobre la atención.'); return; }

    setCompleting(true);
    try {
      let prescriptionImageUrl: string | undefined;
      if (!isWalkerAppt && completePrescriptionUri) prescriptionImageUrl = await uploadImage(completePrescriptionUri);

      const consultation = isWalkerAppt
        ? (completeTreatment.trim() ? { treatmentDone: completeTreatment.trim() } : undefined)
        : {
            visitReason: completeReason,
            ...(completeDiagnosis.trim() ? { diagnosis: completeDiagnosis.trim() } : {}),
            treatmentDone: completeTreatment.trim(),
            ...(prescriptionImageUrl ? { prescriptionImageUrl } : {}),
          };

      await updateDoc(doc(db, COLLECTIONS.APPOINTMENTS, id!), {
        status: 'completed',
        // updateDoc rejects `undefined` field values outright — provider
        // should always be loaded by the time this button is reachable, but
        // guard it anyway rather than risk the write throwing.
        ...(provider?.name ? { vetName: provider.name } : {}),
        completedBy: 'owner',
        ...(consultation ? { consultation } : {}),
        updatedAt: new Date().toISOString(),
      });

      if (needsReview && user && provider) {
        await addDoc(collection(db, COLLECTIONS.REVIEWS), {
          vetId: provider.id,
          ownerId: user.uid,
          ownerName: user.name || 'Usuario',
          rating: completeRating,
          comment: completeComment.trim(),
          createdAt: new Date().toISOString(),
        });
        setAlreadyReviewed(true);
      }

      setAppointment((p) => p ? {
        ...p, status: 'completed' as any, completedBy: 'owner',
        ...(consultation ? { consultation: { ...consultation, createdAt: new Date().toISOString() } as any } : {}),
      } : null);
      setShowCompleteForm(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCompleting(false);
    }
  }

  // Rating a vet whose appointment was already completed (by the vet
  // themselves, or by the owner above) — writes only to reviews, same
  // shape/dedup rule as (owner)/vets/[id].tsx's submitReview.
  async function submitReviewOnly() {
    const provider = vet ?? walker;
    if (!user || !provider) return;
    if (reviewRating === 0) { Alert.alert('Faltan datos', `Por favor califica ${isWalkerAppt ? 'al paseador/cuidador' : 'al veterinario'}.`); return; }
    if (!reviewComment.trim()) { Alert.alert('Faltan datos', 'Escribe un comentario.'); return; }
    setSubmittingReview(true);
    try {
      await addDoc(collection(db, COLLECTIONS.REVIEWS), {
        vetId: provider.id,
        ownerId: user.uid,
        ownerName: user.name || 'Usuario',
        rating: reviewRating,
        comment: reviewComment.trim(),
        createdAt: new Date().toISOString(),
      });
      setAlreadyReviewed(true);
      setShowReviewForm(false);
      Alert.alert('¡Gracias!', 'Tu evaluación fue enviada');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingReview(false);
    }
  }

  async function openChat() {
    const provider = vet ?? walker;
    if (!user || !appointment || !provider) return;
    const chatType = vet ? 'vet' : 'walker';
    const providerLabel = vet ? 'Veterinario' : 'Paseador';
    setOpeningChat(true);
    try {
      // Find or create chat between owner and provider
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.CHATS), where('participants', 'array-contains', user.uid))
      );
      const existing = snap.docs.find((d) =>
        (d.data().participants as string[]).includes(provider.userId)
      );

      let chatId: string;
      if (existing) {
        chatId = existing.id;
      } else {
        const newChat = await addDoc(collection(db, COLLECTIONS.CHATS), {
          participants: [user.uid, provider.userId],
          participantNames: {
            [user.uid]: user.name || 'Dueño',
            [provider.userId]: provider.name || providerLabel,
          },
          chatType,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        chatId = newChat.id;
      }

      await joinChat(chatId).catch(() => {});

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
  const isWalkerAppt = (appointment as any).type === 'walk' || (appointment as any).type === 'pet_care';
  const isCancelled = status === 'cancelled';
  const isCompleted = status === 'completed';
  const canCancel = !isCancelled && !isCompleted;
  const statusColor = STATUS_COLORS[status] ?? GRAY;
  const statusLabel = STATUS_LABELS[status] ?? status;
  // Owner can mark a vet OR walker appointment as done once its date has
  // arrived — for when the provider never completed it through JunglApp
  // themselves. Symmetric with the provider's own completion screens
  // ((vet)/appointment/[id].tsx, (walker)/appointment/[id].tsx) — whoever
  // gets there first closes it out.
  const todayStr = toLocalDateString(new Date());
  const canCompleteAsOwner = (status === 'confirmed' || status === 'arrived') && appointment.date <= todayStr;
  const canReviewNow = !!(vet ?? walker) && alreadyReviewed === false;
  const consultation = appointment.consultation as any;

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
              <Text style={{ color: RED, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>❌ {isWalkerAppt ? 'Reserva cancelada' : 'Cita cancelada'}</Text>
              <Text style={{ color: '#DC2626', fontSize: 13 }}>
                {(appointment as any).cancelledBy === 'vet'
                  ? 'El veterinario canceló esta cita.'
                  : (appointment as any).cancelledBy === 'walker'
                  ? 'El paseador rechazó/canceló esta reserva.'
                  : 'Cancelaste esta cita.'}
              </Text>
            </View>
          )}

          {/* Completed notice */}
          {isCompleted && (
            <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0' }}>
              <Text style={{ color: GREEN, fontWeight: '700', fontSize: 15, marginBottom: consultation ? 10 : 4 }}>
                {isWalkerAppt ? '✅ Servicio completado' : '✅ Consulta completada'}
              </Text>
              {!isWalkerAppt && !consultation && (
                <Text style={{ color: '#047857', fontSize: 13 }}>La consulta fue realizada exitosamente.</Text>
              )}
              {isWalkerAppt && (
                <Text style={{ color: '#047857', fontSize: 13 }}>El paseo/cuidado fue realizado exitosamente.</Text>
              )}
              {consultation && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#BBF7D0', paddingTop: 10, gap: 8 }}>
                  {consultation.visitReason && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 15 }}>{VISIT_REASON_ICONS[consultation.visitReason] ?? '📋'}</Text>
                      <Text style={{ fontWeight: '700', color: DARK, fontSize: 13 }}>{consultation.visitReason}</Text>
                    </View>
                  )}
                  {consultation.diagnosis && (
                    <View>
                      <Text style={{ color: GRAY, fontSize: 12 }}>Diagnóstico</Text>
                      <Text style={{ color: DARK, fontSize: 13 }}>{consultation.diagnosis}</Text>
                    </View>
                  )}
                  {(consultation.treatmentDone || consultation.treatment) ? (
                    <View>
                      <Text style={{ color: GRAY, fontSize: 12 }}>Tratamiento / notas</Text>
                      <Text style={{ color: DARK, fontSize: 13 }}>{consultation.treatmentDone || consultation.treatment}</Text>
                    </View>
                  ) : null}
                  {consultation.prescriptionImageUrl && (
                    <TouchableOpacity onPress={() => Linking.openURL(consultation.prescriptionImageUrl)}>
                      <Text style={{ color: PRIMARY, fontSize: 12, fontWeight: '600' }}>📄 Ver foto de receta</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Calificar veterinario — cita ya completada (por el vet o por el
              dueño) pero sin reseña todavía */}
          {isCompleted && canReviewNow && (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER }}>
              {!showReviewForm ? (
                <TouchableOpacity
                  style={{ alignItems: 'center', paddingVertical: 4 }}
                  onPress={() => { setShowReviewForm(true); setReviewRating(5); }}
                >
                  <Text style={{ fontSize: 22, marginBottom: 4 }}>⭐</Text>
                  <Text style={{ color: PRIMARY, fontWeight: '700', fontSize: 14 }}>{isWalkerAppt ? 'Calificar paseador/cuidador' : 'Calificar veterinario'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontWeight: '700', color: DARK, fontSize: 14 }}>¿Cómo fue la atención de {(vet ?? walker)?.name}?</Text>
                  <StarRating value={reviewRating} onChange={setReviewRating} />
                  <TextInput
                    style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, fontSize: 13, color: DARK, minHeight: 70, textAlignVertical: 'top' }}
                    placeholder="Cuéntanos cómo fue la atención..."
                    multiline
                    value={reviewComment}
                    onChangeText={setReviewComment}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F1F5F9' }}
                      onPress={() => setShowReviewForm(false)}
                    >
                      <Text style={{ color: GRAY, fontWeight: '700' }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: submittingReview ? '#93C5FD' : PRIMARY }}
                      onPress={submitReviewOnly}
                      disabled={submittingReview}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{submittingReview ? 'Enviando...' : 'Enviar evaluación'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Marcar como realizada — el dueño cierra la cita cuando el
              veterinario no lo hizo por la app */}
          {canCompleteAsOwner && (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER }}>
              {!showCompleteForm ? (
                <TouchableOpacity
                  style={{ alignItems: 'center', paddingVertical: 4, flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={() => setShowCompleteForm(true)}
                >
                  <Text style={{ fontSize: 18 }}>✅</Text>
                  <Text style={{ color: GREEN, fontWeight: '700', fontSize: 14 }}>Marcar como realizada</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontWeight: '700', color: DARK, fontSize: 14 }}>
                    {isWalkerAppt ? '¿Cómo estuvo el servicio?' : '¿Qué se hizo en esta atención?'}
                  </Text>

                  {!isWalkerAppt && (
                    <View>
                      <Text style={{ color: GRAY, fontSize: 12, marginBottom: 6 }}>Motivo de la visita</Text>
                      <TouchableOpacity
                        style={{ borderWidth: 1, borderColor: completeReason ? GREEN : BORDER, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                        onPress={() => setShowReasonDropdown((v) => !v)}
                      >
                        <Text style={{ color: completeReason ? DARK : '#94A3B8', fontSize: 13 }}>
                          {completeReason || 'Seleccionar motivo...'}
                        </Text>
                        <Text style={{ color: GRAY }}>{showReasonDropdown ? '▲' : '▼'}</Text>
                      </TouchableOpacity>
                      {showReasonDropdown && (
                        <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 12, marginTop: 4, overflow: 'hidden' }}>
                          {VISIT_REASONS.map((r) => (
                            <TouchableOpacity
                              key={r}
                              style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}
                              onPress={() => { setCompleteReason(r); setShowReasonDropdown(false); }}
                            >
                              <Text style={{ fontSize: 13, color: DARK }}>{VISIT_REASON_ICONS[r]} {r}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {!isWalkerAppt && (
                    <View>
                      <Text style={{ color: GRAY, fontSize: 12, marginBottom: 6 }}>Diagnóstico (opcional)</Text>
                      <TextInput
                        style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, fontSize: 13, color: DARK }}
                        placeholder="Ej: Otitis leve"
                        value={completeDiagnosis}
                        onChangeText={setCompleteDiagnosis}
                      />
                    </View>
                  )}

                  <View>
                    <Text style={{ color: GRAY, fontSize: 12, marginBottom: 6 }}>
                      {isWalkerAppt ? 'Notas (opcional)' : 'Tratamiento / notas de la consulta'}
                    </Text>
                    <TextInput
                      style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, fontSize: 13, color: DARK, minHeight: 70, textAlignVertical: 'top' }}
                      placeholder={isWalkerAppt ? 'Cómo se portó, algo que el paseador deba saber...' : 'Qué se hizo, medicamentos recetados, indicaciones...'}
                      multiline
                      value={completeTreatment}
                      onChangeText={setCompleteTreatment}
                    />
                  </View>

                  {!isWalkerAppt && (
                    <TouchableOpacity onPress={pickCompletePrescription}>
                      <Text style={{ color: PRIMARY, fontSize: 12, fontWeight: '600' }}>
                        {completePrescriptionUri ? '📄 Foto de receta agregada — cambiar' : '📄 Agregar foto de receta (opcional)'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {alreadyReviewed === false && (
                    <>
                      <View style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12 }}>
                        <Text style={{ fontWeight: '700', color: DARK, fontSize: 14, marginBottom: 8 }}>¿Cómo fue la atención de {(vet ?? walker)?.name}?</Text>
                        <StarRating value={completeRating} onChange={setCompleteRating} />
                      </View>
                      <TextInput
                        style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, fontSize: 13, color: DARK, minHeight: 70, textAlignVertical: 'top' }}
                        placeholder="Cuéntanos cómo fue la atención..."
                        multiline
                        value={completeComment}
                        onChangeText={setCompleteComment}
                      />
                    </>
                  )}

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F1F5F9' }}
                      onPress={() => setShowCompleteForm(false)}
                    >
                      <Text style={{ color: GRAY, fontWeight: '700' }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: completing ? '#86EFAC' : GREEN }}
                      onPress={submitOwnerComplete}
                      disabled={completing}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{completing ? 'Guardando...' : 'Guardar'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
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

                {/* WhatsApp — alternative to the in-app chat above, vet-only.
                    Opens the vet's own WhatsApp, not a JunglApp conversation
                    (no history/notifications on our side for this channel). */}
                {vet.phone ? (
                  <TouchableOpacity
                    style={{ marginTop: 8, backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                    onPress={() => {
                      const digits = vet.phone.replace(/\D/g, '');
                      const text = `Hola${vet.name ? ` Dr./Dra. ${vet.name}` : ''}, te escribo desde JunglApp sobre mi cita del ${appointment?.date ?? ''}${appointment?.time ? ` a las ${appointment.time}` : ''}.`;
                      Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`).catch(() =>
                        Alert.alert('Error', 'No se pudo abrir WhatsApp. ¿Lo tienes instalado?')
                      );
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>📱</Text>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Escribir por WhatsApp</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}

          {/* ── Paseador / Cuidador ── */}
          {walker && (
            <>
              <Text style={{ fontWeight: '700', color: DARK, fontSize: 15, marginBottom: 10 }}>Paseador / Cuidador</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: BORDER }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  {walker.photoUrl ? (
                    <Image source={{ uri: walker.photoUrl }} style={{ width: 60, height: 60, borderRadius: 30 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 28 }}>🦮</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: DARK, fontSize: 16 }}>{walker.name}</Text>
                    <Text style={{ color: GRAY, fontSize: 13 }}>{walker.city}, {walker.region}</Text>
                  </View>
                </View>

                {/* Phone */}
                {walker.phone ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <View>
                      <Text style={{ color: GRAY, fontSize: 12 }}>Teléfono</Text>
                      <Text style={{ color: DARK, fontSize: 14, fontWeight: '600' }}>{walker.phone}</Text>
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: '#ECFDF5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                      onPress={() => Linking.openURL(`tel:${walker.phone}`)}
                    >
                      <Text style={{ fontSize: 16 }}>📞</Text>
                      <Text style={{ color: GREEN, fontWeight: '700', fontSize: 13 }}>Llamar</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Fee */}
                {(appointment as any).type === 'pet_care' ? (
                  walker.careFee ? (
                    <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                      <Text style={{ color: GRAY, fontSize: 12 }}>Valor cuidado</Text>
                      <Text style={{ color: DARK, fontSize: 14, fontWeight: '600' }}>
                        ${Number(walker.careFee).toLocaleString('es-CL')} CLP/día
                      </Text>
                    </View>
                  ) : null
                ) : walker.walkFee ? (
                  <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <Text style={{ color: GRAY, fontSize: 12 }}>Valor paseo</Text>
                    <Text style={{ color: DARK, fontSize: 14, fontWeight: '600' }}>
                      ${Number(walker.walkFee).toLocaleString('es-CL')} CLP
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
                    {openingChat ? 'Abriendo chat...' : 'Escribir al paseador'}
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
