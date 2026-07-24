import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, getDocs, collection, query, where, addDoc, writeBatch } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { addAppointmentToDeviceCalendar } from '../../../lib/calendar';
import { logAppointmentBooked } from '../../../lib/analytics';
import type { Groomer, Pet, GroomingService } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#9333EA';

// Older accounts store raw service ids (from registration's checkbox list) instead
// of the newer serviceOfferings[] with proper Spanish names — translate them here.
const SERVICE_LABELS: Record<string, string> = {
  bath: '🛁 Baño y secado',
  haircut: '✂️ Corte de pelo',
  nails: '💅 Corte de uñas',
  ears: '👂 Limpieza de oídos',
};

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={{ fontSize: size, opacity: i <= Math.round(rating) ? 1 : 0.25 }}>⭐</Text>
      ))}
    </View>
  );
}

export default function GroomerDetailScreen() {
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
  const [groomer, setGroomer] = useState<Groomer | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<GroomingService | null>(null);
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
  const [canReview, setCanReview] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.GROOMERS, id)).then((snap) => {
      if (snap.exists()) setGroomer({ id: snap.id, ...snap.data() } as Groomer);
    }).catch(() => {});
    getDocs(query(collection(db, COLLECTIONS.REVIEWS), where('vetId', '==', id))).then((snap) => {
      const rv = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rv.sort((a: any, b: any) => b.createdAt?.localeCompare(a.createdAt));
      setReviews(rv);
    }).catch(() => {});
    if (user?.uid) {
      getDocs(query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))).then((snap) => {
        setPets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)).filter((p) => !p.deceasedAt));
      }).catch(() => {});

      Promise.all([
        getDocs(query(
          collection(db, COLLECTIONS.APPOINTMENTS),
          where('vetId', '==', id),
          where('ownerId', '==', user.uid),
          where('status', '==', 'completed'),
        )),
        getDocs(query(collection(db, COLLECTIONS.REVIEWS), where('vetId', '==', id), where('ownerId', '==', user.uid))),
      ]).then(([apptSnap, reviewSnap]) => {
        setHasReviewed(!reviewSnap.empty);
        if (!apptSnap.empty && reviewSnap.empty) setCanReview(true);
      }).catch(() => {});
    }
  }, [id, user]);

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const availableSlots = groomer?.availability?.[selectedDate] || [];

  const hasServiceOfferings = (groomer?.serviceOfferings?.length ?? 0) > 0;

  async function placeBooking() {
    if (!selectedDate || !selectedTime || !selectedPet) { Alert.alert('Selecciona', 'Elige mascota, fecha y hora'); return; }
    if (hasServiceOfferings && !selectedService) { Alert.alert('Selecciona', 'Elige qué servicio deseas agendar'); return; }
    if (!user || !groomer) return;
    setBooking(true);
    try {
      // Both writes commit atomically — if the clientLinks write is
      // rejected, the appointment must not be left orphaned either,
      // otherwise retrying after the error re-creates it (duplicate
      // agenda entries every retry).
      const apptRef = doc(collection(db, COLLECTIONS.APPOINTMENTS));
      const batch = writeBatch(db);
      batch.set(apptRef, {
        vetId: groomer.id,
        ownerId: user.uid,
        ownerName: user.name || 'Dueño',
        petId: selectedPet,
        date: selectedDate,
        time: selectedTime,
        reason: bookNote.trim() || selectedService?.name || 'Servicio de peluquería',
        status: 'pending',
        type: 'grooming',
        ...(selectedService ? {
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          servicePrice: selectedService.price,
        } : {}),
        createdAt: new Date().toISOString(),
      });
      // Grants the groomer scoped read access to this owner's profile (see
      // firestore.rules `users/{uid}` read rule) — only for owners they've
      // actually booked with, not every owner in the app. Must be keyed by
      // the groomer's auth UID (groomer.userId), not the groomers doc ID
      // (groomer.id) — the read-side rule checks request.auth.uid. merge:true
      // keeps repeat bookings with the same groomer idempotent instead of
      // failing (the doc already exists after the first booking).
      batch.set(doc(db, COLLECTIONS.CLIENT_LINKS, `${groomer.userId}_${user.uid}`), {
        professionalId: groomer.userId,
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
      }, { merge: true });
      await batch.commit();
      logAppointmentBooked('groomer');

      // Add to the owner's device calendar — non-critical, failure must not block the booking
      addAppointmentToDeviceCalendar(`Peluquería — ${groomer.name}`, selectedDate, selectedTime);

      setBookModal(false);
      Alert.alert(
        '¡Servicio agendado! ✂️',
        `Reservaste el ${selectedDate} a las ${selectedTime} con ${groomer.name}.`,
        [{ text: 'OK', onPress: () => router.replace('/(owner)' as any) }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBooking(false);
    }
  }

  async function submitReview() {
    if (!groomer || !user) return;
    if (reviewComment.trim().length > 2000) {
      Alert.alert('Reseña muy larga', 'El comentario no puede superar 2000 caracteres.');
      return;
    }
    setSubmittingReview(true);
    try {
      await addDoc(collection(db, COLLECTIONS.REVIEWS), {
        vetId: groomer.id,
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

  if (!groomer) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#9CA3AF' }}>Cargando peluquería...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={{ backgroundColor: PURPLE, height: 160, alignItems: 'center', justifyContent: 'center' }}>
          {groomer.photoUrl ? (
            <Image source={{ uri: groomer.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Text style={{ fontSize: 64 }}>✂️</Text>
          )}
        </View>
        <TouchableOpacity onPress={goBack} style={{ position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 8 }}>
          <Text style={{ color: '#374151', fontSize: 16, paddingHorizontal: 4 }}>←</Text>
        </TouchableOpacity>

        <View style={{ paddingHorizontal: 24 }}>
          {/* Info card */}
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, marginTop: -24, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, marginBottom: 20 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1F2937' }}>{groomer.businessName || groomer.name}</Text>
            {(groomer.rating ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Stars rating={groomer.rating!} />
                <Text style={{ color: '#6B7280', fontSize: 13 }}>{groomer.rating?.toFixed(1)} · {groomer.reviewCount ?? 0} reseñas</Text>
              </View>
            )}
            {!!groomer.fee && (
              <View style={{ backgroundColor: '#F3E8FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 10 }}>
                <Text style={{ color: PURPLE, fontWeight: '800', fontSize: 15 }}>Desde ${groomer.fee.toLocaleString()}</Text>
              </View>
            )}
            <View style={{ marginTop: 12, gap: 6 }}>
              <Text style={{ color: '#6B7280', fontSize: 13 }}>🏠 {groomer.serviceType === 'home' ? 'A domicilio' : 'En tienda'}</Text>
              {groomer.address && <Text style={{ color: '#6B7280', fontSize: 13 }}>📍 {groomer.address}</Text>}
              {!groomer.address && <Text style={{ color: '#6B7280', fontSize: 13 }}>📍 {groomer.city}, {groomer.region}</Text>}
              {groomer.phone && <Text style={{ color: '#6B7280', fontSize: 13 }}>📞 {groomer.phone}</Text>}
            </View>
            {hasServiceOfferings ? (
              <View style={{ marginTop: 12, gap: 6 }}>
                {groomer.serviceOfferings!.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F3E8FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ color: '#581C87', fontSize: 13, fontWeight: '600' }}>{s.name}</Text>
                    <Text style={{ color: PURPLE, fontSize: 13, fontWeight: '700' }}>${s.price.toLocaleString('es-CL')}</Text>
                  </View>
                ))}
              </View>
            ) : groomer.services?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {groomer.services.map((s) => (
                  <View key={s} style={{ backgroundColor: '#F3E8FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: PURPLE, fontSize: 12, fontWeight: '600' }}>{SERVICE_LABELS[s] || s}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Book button */}
          <TouchableOpacity
            onPress={() => setBookModal(true)}
            style={{ backgroundColor: PURPLE, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 20 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>📅 Agendar servicio</Text>
          </TouchableOpacity>

          {/* Reviews */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>Reseñas ({reviews.length})</Text>
              {canReview && !hasReviewed && (
                <TouchableOpacity onPress={() => setReviewModal(true)} style={{ backgroundColor: '#F3E8FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: PURPLE, fontWeight: '600', fontSize: 13 }}>+ Dejar reseña</Text>
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
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 16 }}>📅 Agendar servicio</Text>

              {/* Pet selector */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Selecciona tu mascota</Text>
              {pets.length === 0 ? (
                <Text style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 16 }}>No tienes mascotas registradas</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {pets.map((pet) => (
                      <TouchableOpacity
                        key={pet.id}
                        onPress={() => setSelectedPet(pet.id)}
                        style={{
                          borderRadius: 16, padding: 12, borderWidth: 2, alignItems: 'center', width: 80,
                          borderColor: selectedPet === pet.id ? PURPLE : '#E5E7EB',
                          backgroundColor: selectedPet === pet.id ? '#F3E8FF' : '#fff',
                        }}
                      >
                        <Text style={{ fontSize: 28 }}>{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                        <Text style={{ fontSize: 11, color: '#475569', marginTop: 4, textAlign: 'center' }}>{pet.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}

              {/* Service selector */}
              {hasServiceOfferings && (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Selecciona servicio</Text>
                  <View style={{ gap: 8, marginBottom: 16 }}>
                    {groomer.serviceOfferings!.map((s) => {
                      const sel = selectedService?.id === s.id;
                      return (
                        <TouchableOpacity
                          key={s.id}
                          onPress={() => setSelectedService(s)}
                          style={{
                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5,
                            borderColor: sel ? PURPLE : '#E5E7EB',
                            backgroundColor: sel ? '#F3E8FF' : '#fff',
                          }}
                        >
                          <Text style={{ color: sel ? PURPLE : '#374151', fontWeight: '600', fontSize: 14 }}>{s.name}</Text>
                          <Text style={{ color: sel ? PURPLE : '#6B7280', fontWeight: '700', fontSize: 13 }}>${s.price.toLocaleString('es-CL')}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Date strip */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Selecciona fecha</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {dates.map((date) => {
                    const d = new Date(date + 'T12:00:00');
                    const sel = date === selectedDate;
                    const hasSlots = (groomer.availability?.[date] || []).length > 0;
                    return (
                      <TouchableOpacity
                        key={date}
                        onPress={() => { setSelectedDate(date); setSelectedTime(''); }}
                        style={{
                          width: 52, alignItems: 'center', paddingVertical: 8, borderRadius: 12,
                          backgroundColor: sel ? PURPLE : '#fff',
                          borderWidth: 1, borderColor: sel ? PURPLE : '#E5E7EB',
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
                            backgroundColor: selectedTime === slot ? PURPLE : '#fff',
                            borderColor: selectedTime === slot ? PURPLE : '#E5E7EB',
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
                placeholder="Cuéntale sobre tu mascota, raza, temperamento..."
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
                  disabled={booking || !selectedDate || !selectedTime || !selectedPet || (hasServiceOfferings && !selectedService)}
                  style={{
                    flex: 1,
                    backgroundColor: (selectedDate && selectedTime && selectedPet && (!hasServiceOfferings || selectedService)) ? PURPLE : '#D1D5DB',
                    borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: booking ? 0.7 : 1,
                  }}
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
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 16 }}>⭐ Evaluar peluquería</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TouchableOpacity key={i} onPress={() => setReviewRating(i)}>
                    <Text style={{ fontSize: 36, opacity: i <= reviewRating ? 1 : 0.3 }}>⭐</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 }}
                placeholder="Comparte tu experiencia..."
                multiline
                value={reviewComment}
                onChangeText={setReviewComment}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }} onPress={() => setReviewModal(false)}>
                  <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitReview} disabled={submittingReview} style={{ flex: 1, backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: submittingReview ? 0.7 : 1 }}>
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
