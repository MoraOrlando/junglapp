import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, getDocs, collection, query, where, addDoc, setDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Walker, Pet } from '@junglapp/types';

const { db } = initFirebase();
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

export default function WalkerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [walker, setWalker] = useState<Walker | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [serviceType, setServiceType] = useState<'walk' | 'care'>('walk');
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
    getDoc(doc(db, COLLECTIONS.WALKERS, id)).then((snap) => {
      if (snap.exists()) setWalker({ id: snap.id, ...snap.data() } as Walker);
    }).catch(() => {});
    getDocs(query(collection(db, COLLECTIONS.REVIEWS), where('vetId', '==', id))).then((snap) => {
      const rv = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rv.sort((a: any, b: any) => b.createdAt?.localeCompare(a.createdAt));
      setReviews(rv);
    }).catch(() => {});
    if (user?.uid) {
      getDocs(query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))).then((snap) => {
        setPets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));
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
  const availableSlots = walker?.availability?.[selectedDate] || [];

  async function placeBooking() {
    if (!selectedDate || !selectedTime || !selectedPet) { Alert.alert('Selecciona', 'Elige mascota, fecha y hora'); return; }
    if (!user || !walker) return;
    setBooking(true);
    try {
      await addDoc(collection(db, COLLECTIONS.APPOINTMENTS), {
        vetId: walker.id,
        ownerId: user.uid,
        petId: selectedPet,
        date: selectedDate,
        time: selectedTime,
        reason: bookNote.trim() || (serviceType === 'walk' ? 'Paseo de perro' : 'Cuidado / hospedaje'),
        status: 'pending',
        type: serviceType === 'walk' ? 'walk' : 'pet_care',
        createdAt: new Date().toISOString(),
      });
      // Grants the walker scoped read access to this owner's profile (see
      // firestore.rules `users/{uid}` read rule) — only for owners they've
      // actually booked with, not every owner in the app.
      await setDoc(doc(db, COLLECTIONS.CLIENT_LINKS, `${walker.id}_${user.uid}`), {
        professionalId: walker.id,
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
      });
      setBookModal(false);
      Alert.alert(
        '¡Servicio agendado! 🦮',
        `Reservaste el ${selectedDate} a las ${selectedTime} con ${walker.name}.`,
        [{ text: 'OK', onPress: () => router.replace('/(owner)' as any) }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBooking(false);
    }
  }

  async function submitReview() {
    if (!walker || !user) return;
    if (reviewComment.trim().length > 2000) {
      Alert.alert('Reseña muy larga', 'El comentario no puede superar 2000 caracteres.');
      return;
    }
    setSubmittingReview(true);
    try {
      await addDoc(collection(db, COLLECTIONS.REVIEWS), {
        vetId: walker.id,
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

  if (!walker) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#9CA3AF' }}>Cargando paseador...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={{ backgroundColor: GREEN, height: 160, alignItems: 'center', justifyContent: 'center' }}>
          {walker.photoUrl ? (
            <Image source={{ uri: walker.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Text style={{ fontSize: 64 }}>🦮</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => router.back()} style={{ position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 8 }}>
          <Text style={{ color: '#374151', fontSize: 16, paddingHorizontal: 4 }}>←</Text>
        </TouchableOpacity>

        <View style={{ paddingHorizontal: 24 }}>
          {/* Info card */}
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, marginTop: -24, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, marginBottom: 20 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1F2937' }}>{walker.name}</Text>
            {(walker.rating ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Stars rating={walker.rating!} />
                <Text style={{ color: '#6B7280', fontSize: 13 }}>{walker.rating?.toFixed(1)} · {(walker as any).reviewCount ?? 0} reseñas</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {!!walker.walkFee && (
                <View style={{ backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: '#059669', fontWeight: '800', fontSize: 13 }}>${walker.walkFee.toLocaleString()} / paseo</Text>
                </View>
              )}
              {!!walker.careFee && (
                <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: '#1D4ED8', fontWeight: '800', fontSize: 13 }}>${walker.careFee.toLocaleString()} / día cuidado</Text>
                </View>
              )}
            </View>
            <View style={{ marginTop: 12, gap: 6 }}>
              <Text style={{ color: '#6B7280', fontSize: 13 }}>📍 {walker.address ? `${walker.address}, ` : ''}{walker.city}, {walker.region}</Text>
              {walker.phone && <Text style={{ color: '#6B7280', fontSize: 13 }}>📞 {walker.phone}</Text>}
              <Text style={{ color: '#6B7280', fontSize: 13 }}>🐾 {walker.experience} años de experiencia · máx. {walker.maxDogs} perros por paseo</Text>
            </View>
            {walker.sizesAccepted?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {walker.sizesAccepted.map((s) => (
                  <View key={s} style={{ backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: GREEN, fontSize: 12, fontWeight: '600' }}>{s}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Book button */}
          <TouchableOpacity
            onPress={() => setBookModal(true)}
            style={{ backgroundColor: GREEN, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 20 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>📅 Agendar servicio</Text>
          </TouchableOpacity>

          {/* Reviews */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>Reseñas ({reviews.length})</Text>
              {canReview && !hasReviewed && (
                <TouchableOpacity onPress={() => setReviewModal(true)} style={{ backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: GREEN, fontWeight: '600', fontSize: 13 }}>+ Dejar reseña</Text>
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

              {/* Service type */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Tipo de servicio</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => setServiceType('walk')}
                  style={{ flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: serviceType === 'walk' ? '#ECFDF5' : '#fff', borderColor: serviceType === 'walk' ? '#10B981' : '#E5E7EB' }}
                >
                  <Text style={{ fontWeight: '600', color: serviceType === 'walk' ? '#059669' : '#6B7280' }}>🦮 Paseo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setServiceType('care')}
                  style={{ flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: serviceType === 'care' ? '#EFF6FF' : '#fff', borderColor: serviceType === 'care' ? '#3B82F6' : '#E5E7EB' }}
                >
                  <Text style={{ fontWeight: '600', color: serviceType === 'care' ? '#1D4ED8' : '#6B7280' }}>🏠 Cuidado</Text>
                </TouchableOpacity>
              </View>

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
                          borderColor: selectedPet === pet.id ? GREEN : '#E5E7EB',
                          backgroundColor: selectedPet === pet.id ? '#ECFDF5' : '#fff',
                        }}
                      >
                        <Text style={{ fontSize: 28 }}>{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                        <Text style={{ fontSize: 11, color: '#475569', marginTop: 4, textAlign: 'center' }}>{pet.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}

              {/* Date strip */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Selecciona fecha</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {dates.map((date) => {
                    const d = new Date(date + 'T12:00:00');
                    const sel = date === selectedDate;
                    const hasSlots = (walker.availability?.[date] || []).length > 0;
                    return (
                      <TouchableOpacity
                        key={date}
                        onPress={() => { setSelectedDate(date); setSelectedTime(''); }}
                        style={{
                          width: 52, alignItems: 'center', paddingVertical: 8, borderRadius: 12,
                          backgroundColor: sel ? GREEN : '#fff',
                          borderWidth: 1, borderColor: sel ? GREEN : '#E5E7EB',
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
                            backgroundColor: selectedTime === slot ? GREEN : '#fff',
                            borderColor: selectedTime === slot ? GREEN : '#E5E7EB',
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
                placeholder="Cuéntale sobre tu mascota, indicaciones especiales..."
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
                  disabled={booking || !selectedDate || !selectedTime || !selectedPet}
                  style={{ flex: 1, backgroundColor: selectedDate && selectedTime && selectedPet ? GREEN : '#D1D5DB', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: booking ? 0.7 : 1 }}
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
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 16 }}>⭐ Evaluar paseador</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TouchableOpacity key={i} onPress={() => setReviewRating(i)}>
                    <Text style={{ fontSize: 36, opacity: i <= reviewRating ? 1 : 0.3 }}>⭐</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 }}
                placeholder="Comparte tu experiencia con este paseador..."
                multiline
                value={reviewComment}
                onChangeText={setReviewComment}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }} onPress={() => setReviewModal(false)}>
                  <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitReview} disabled={submittingReview} style={{ flex: 1, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: submittingReview ? 0.7 : 1 }}>
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
