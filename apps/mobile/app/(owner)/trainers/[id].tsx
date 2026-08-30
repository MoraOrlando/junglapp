import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, getDocs, collection, query, where, addDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, createAppointment } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { addAppointmentToDeviceCalendar } from '../../../lib/calendar';
import { logAppointmentBooked } from '../../../lib/analytics';
import { getSortedAvailableSlots } from '../../../lib/distance';
import FullScreenImageViewer from '../../../components/FullScreenImageViewer';
import type { Trainer } from '@junglapp/types';

const { db } = initFirebase();
const INDIGO = '#4F46E5';
const GREEN = '#2D6A4F';

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={{ fontSize: size, opacity: i <= Math.round(rating) ? 1 : 0.25 }}>⭐</Text>
      ))}
    </View>
  );
}

export default function TrainerDetailScreen() {
  const { id, backTo } = useLocalSearchParams<{ id: string; backTo?: string }>();
  const router = useRouter();
  const { user } = useAuth();

  // See vets/[id].tsx — this screen lives in its own hidden tab stack,
  // so router.back() has nothing to pop to without an explicit return path.
  function goBack() {
    if (backTo) router.push(backTo as any);
    else if (router.canGoBack()) router.back();
    else router.push('/(owner)/near' as any);
  }
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [bookNote, setBookNote] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookModal, setBookModal] = useState(false);

  // Review modal
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.TRAINERS, id)).then((snap) => {
      if (snap.exists()) setTrainer({ id: snap.id, ...snap.data() } as Trainer);
    }).catch(() => {});
    getDocs(query(collection(db, COLLECTIONS.REVIEWS), where('vetId', '==', id))).then((snap) => {
      const rv = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rv.sort((a: any, b: any) => b.createdAt?.localeCompare(a.createdAt));
      setReviews(rv);
    }).catch(() => {});
    if (user?.uid) {
      getDocs(query(collection(db, COLLECTIONS.REVIEWS), where('vetId', '==', id), where('ownerId', '==', user.uid))).then((snap) => {
        setHasReviewed(!snap.empty);
      }).catch(() => {});
    }
  }, [id, user]);

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const availableSlots = getSortedAvailableSlots(trainer?.availability, selectedDate);

  async function placeBooking() {
    if (!selectedDate || !selectedTime) { Alert.alert('Selecciona', 'Elige fecha y hora'); return; }
    if (!user || !trainer) return;
    setBooking(true);
    try {
      // createAppointment (Cloud Function) writes the appointment and the
      // clientLinks grant atomically server-side, and enforces the Premium
      // plan's weekly quota — see functions/src/index.ts.
      await createAppointment({
        vetId: trainer.id,
        petId: '',
        date: selectedDate,
        time: selectedTime,
        reason: bookNote.trim() || 'Sesión de adiestramiento',
        type: 'training',
      });
      logAppointmentBooked('trainer');

      // Add to the owner's device calendar — non-critical, failure must not block the booking
      addAppointmentToDeviceCalendar(`Adiestramiento — ${trainer.name}`, selectedDate, selectedTime);

      setBookModal(false);
      Alert.alert(
        '¡Sesión agendada! 🐕',
        `Reservaste el ${selectedDate} a las ${selectedTime} con ${trainer.name}.`,
        [{ text: 'OK', onPress: () => router.replace('/(owner)' as any) }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBooking(false);
    }
  }

  async function submitReview() {
    if (!trainer || !user) return;
    if (reviewComment.trim().length > 2000) {
      Alert.alert('Reseña muy larga', 'El comentario no puede superar 2000 caracteres.');
      return;
    }
    setSubmittingReview(true);
    try {
      // Only write the review — rating recalculation is handled server-side
      // via a Cloud Function triggered by onCreate in the reviews collection.
      await addDoc(collection(db, COLLECTIONS.REVIEWS), {
        vetId: trainer.id,
        ownerId: user.uid,
        ownerName: user.name || 'Usuario',
        rating: reviewRating,
        comment: reviewComment.trim(),
        createdAt: new Date().toISOString(),
      });
      setHasReviewed(true);
      setReviewModal(false);
      Alert.alert('¡Gracias por tu reseña! 🐾', 'Tu calificación fue registrada.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingReview(false);
    }
  }

  if (!trainer) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#9CA3AF' }}>Cargando adiestrador...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <TouchableOpacity
          activeOpacity={trainer.photoUrl ? 0.9 : 1}
          onPress={() => trainer.photoUrl && setViewerUri(trainer.photoUrl)}
          style={{ backgroundColor: INDIGO, height: 160, alignItems: 'center', justifyContent: 'center' }}
        >
          {trainer.photoUrl ? (
            <Image source={{ uri: trainer.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Text style={{ fontSize: 64 }}>🐕</Text>
          )}
        </TouchableOpacity>
        <FullScreenImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
        <TouchableOpacity onPress={goBack} style={{ position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 8 }}>
          <Text style={{ color: '#374151', fontSize: 16, paddingHorizontal: 4 }}>←</Text>
        </TouchableOpacity>

        <View style={{ paddingHorizontal: 24 }}>
          {/* Info card */}
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, marginTop: -24, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, marginBottom: 20 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1F2937' }}>{trainer.name}</Text>
            {(trainer.rating ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Stars rating={trainer.rating!} />
                <Text style={{ color: '#6B7280', fontSize: 13 }}>{trainer.rating?.toFixed(1)} · {trainer.reviewCount} reseñas</Text>
              </View>
            )}
            {trainer.consultationFee > 0 && (
              <View style={{ backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 10 }}>
                <Text style={{ color: '#059669', fontWeight: '800', fontSize: 15 }}>${trainer.consultationFee.toLocaleString()} / sesión</Text>
              </View>
            )}
            <View style={{ marginTop: 12, gap: 6 }}>
              {trainer.serviceArea && <Text style={{ color: '#6B7280', fontSize: 13 }}>📍 {trainer.serviceArea}</Text>}
              {trainer.phone && <Text style={{ color: '#6B7280', fontSize: 13 }}>📞 {trainer.phone}</Text>}
            </View>
            {trainer.experience && (
              <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 10, lineHeight: 20 }}>{trainer.experience}</Text>
            )}
            {trainer.specialties?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {trainer.specialties.map((s) => (
                  <View key={s} style={{ backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: INDIGO, fontSize: 12, fontWeight: '600' }}>{s}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {!!trainer.serviceInstructions && (
            <View style={{ backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#C7D2FE' }}>
              <Text style={{ color: INDIGO, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>📋 Indicaciones del servicio</Text>
              <Text style={{ color: '#374151', fontSize: 13, lineHeight: 19 }}>{trainer.serviceInstructions}</Text>
            </View>
          )}

          {/* Book button */}
          <TouchableOpacity
            onPress={() => setBookModal(true)}
            style={{ backgroundColor: INDIGO, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 20 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>📅 Agendar sesión</Text>
          </TouchableOpacity>

          {/* Reviews */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>Reseñas ({reviews.length})</Text>
              {!hasReviewed && (
                <TouchableOpacity onPress={() => setReviewModal(true)} style={{ backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: INDIGO, fontWeight: '600', fontSize: 13 }}>+ Dejar reseña</Text>
                </TouchableOpacity>
              )}
            </View>
            {reviews.length === 0 ? (
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Sin reseñas aún. ¡Sé el primero en evaluar!</Text>
            ) : (
              <View style={{ gap: 10, paddingBottom: 32 }}>
                {reviews.slice(0, 5).map((r: any) => (
                  <View key={r.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F3F4F6' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '600', color: '#1F2937' }}>{r.ownerName}</Text>
                      <Stars rating={r.rating} size={13} />
                    </View>
                    {r.comment && <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 6 }}>{r.comment}</Text>}
                    <Text style={{ color: '#D1D5DB', fontSize: 11, marginTop: 6 }}>{r.createdAt?.slice(0, 10)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Booking modal */}
      <Modal visible={bookModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 16 }}>📅 Agendar sesión</Text>

              {/* Date strip */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Selecciona fecha</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {dates.map((date) => {
                    const d = new Date(date + 'T12:00:00');
                    const sel = date === selectedDate;
                    const hasSlots = (trainer.availability?.[date] || []).length > 0;
                    return (
                      <TouchableOpacity
                        key={date}
                        onPress={() => { setSelectedDate(date); setSelectedTime(''); }}
                        style={{
                          width: 52, alignItems: 'center', paddingVertical: 8, borderRadius: 12,
                          backgroundColor: sel ? INDIGO : '#fff',
                          borderWidth: 1, borderColor: sel ? INDIGO : '#E5E7EB',
                          opacity: hasSlots || sel ? 1 : 0.4,
                        }}
                        disabled={!hasSlots && !sel}
                      >
                        <Text style={{ fontSize: 10, color: sel ? 'rgba(255,255,255,0.8)' : '#9CA3AF' }}>{dayNames[d.getDay()]}</Text>
                        <Text style={{ fontSize: 17, fontWeight: '700', color: sel ? '#fff' : '#1F2937' }}>{d.getDate()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Slots */}
              {selectedDate && (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Selecciona horario</Text>
                  {availableSlots.length === 0 ? (
                    <Text style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 16 }}>Sin horarios disponibles para este día</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {availableSlots.map((slot) => (
                        <TouchableOpacity
                          key={slot}
                          onPress={() => setSelectedTime(slot)}
                          style={{
                            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
                            backgroundColor: selectedTime === slot ? INDIGO : '#fff',
                            borderColor: selectedTime === slot ? INDIGO : '#E5E7EB',
                          }}
                        >
                          <Text style={{ color: selectedTime === slot ? '#fff' : '#374151', fontWeight: '600', fontSize: 13 }}>{slot}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <TextInput
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 60, textAlignVertical: 'top', marginBottom: 16 }}
                placeholder="Cuéntale sobre tu mascota, raza, edad, comportamiento a trabajar..."
                multiline
                value={bookNote}
                onChangeText={setBookNote}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }} onPress={() => setBookModal(false)}>
                  <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={placeBooking}
                  disabled={booking || !selectedDate || !selectedTime}
                  style={{ flex: 1, backgroundColor: selectedDate && selectedTime ? INDIGO : '#D1D5DB', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: booking ? 0.7 : 1 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{booking ? 'Agendando...' : 'Confirmar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Review modal */}
      <Modal visible={reviewModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 16 }}>⭐ Evaluar adiestrador</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TouchableOpacity key={i} onPress={() => setReviewRating(i)}>
                    <Text style={{ fontSize: 36, opacity: i <= reviewRating ? 1 : 0.3 }}>⭐</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 }}
                placeholder="Comparte tu experiencia con este adiestrador..."
                multiline
                value={reviewComment}
                onChangeText={setReviewComment}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }} onPress={() => setReviewModal(false)}>
                  <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitReview} disabled={submittingReview} style={{ flex: 1, backgroundColor: INDIGO, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: submittingReview ? 0.7 : 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{submittingReview ? 'Enviando...' : 'Publicar reseña'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
