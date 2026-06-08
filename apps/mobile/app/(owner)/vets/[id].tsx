import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Veterinarian, Pet } from '@junglapp/types';

const { db } = initFirebase();

function getNextDays(n: number): string[] {
  const days: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function StarDisplay({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={{ fontSize: size, color: i <= Math.round(rating) ? '#F59E0B' : '#D1D5DB' }}>
          ★
        </Text>
      ))}
    </View>
  );
}

interface Review {
  id: string;
  vetId: string;
  ownerId: string;
  ownerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export default function VetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [vet, setVet] = useState<Veterinarian | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedPet, setSelectedPet] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [booking, setBooking] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const days = getNextDays(7);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.VETERINARIANS, id)).then((snap) => {
      if (snap.exists()) setVet({ id: snap.id, ...snap.data() } as Veterinarian);
    });

    getDocs(
      query(collection(db, COLLECTIONS.REVIEWS), where('vetId', '==', id))
    ).then((snap) => {
      const r = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
      r.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
      setReviews(r.slice(0, 5));
    });

    if (user) {
      getDocs(query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))).then((snap) => {
        setPets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));
      });

      // Check if user has a completed appointment and hasn't reviewed yet
      Promise.all([
        getDocs(query(
          collection(db, COLLECTIONS.APPOINTMENTS),
          where('vetId', '==', id),
          where('ownerId', '==', user.uid),
          where('status', '==', 'completed'),
        )),
        getDocs(query(
          collection(db, COLLECTIONS.REVIEWS),
          where('vetId', '==', id),
          where('ownerId', '==', user.uid),
        )),
      ]).then(([apptSnap, reviewSnap]) => {
        if (!apptSnap.empty && reviewSnap.empty) {
          setCanReview(true);
        }
      });
    }
  }, [id, user]);

  function getAvailableSlotsForDate(date: string): string[] {
    return vet?.availability?.[date] || [];
  }

  async function bookAppointment() {
    if (!selectedDate || !selectedTime || !selectedPet || !user || !vet) {
      Alert.alert('Falta información', 'Selecciona fecha, hora y mascota');
      return;
    }
    setBooking(true);
    try {
      await addDoc(collection(db, COLLECTIONS.APPOINTMENTS), {
        petId: selectedPet,
        ownerId: user.uid,
        vetId: vet.id,
        date: selectedDate,
        time: selectedTime,
        reason,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      Alert.alert('¡Listo!', 'Cita agendada correctamente', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBooking(false);
    }
  }

  async function submitReview() {
    if (!user || !vet || !reviewComment.trim()) {
      Alert.alert('Error', 'Escribe un comentario');
      return;
    }
    setSubmittingReview(true);
    try {
      const newReview: Omit<Review, 'id'> = {
        vetId: vet.id,
        ownerId: user.uid,
        ownerName: user.name || 'Usuario',
        rating: reviewRating,
        comment: reviewComment.trim(),
        createdAt: new Date().toISOString(),
      };
      if (reviewComment.trim().length > 2000) {
        Alert.alert('Reseña muy larga', 'El comentario no puede superar 2000 caracteres.');
        return;
      }
      // Only write the review — rating recalculation handled server-side via Cloud Function
      await addDoc(collection(db, COLLECTIONS.REVIEWS), newReview);

      setReviews((prev) => [{ ...newReview, id: 'new' }, ...prev].slice(0, 5));
      setCanReview(false);
      setShowReviewForm(false);
      Alert.alert('¡Gracias!', 'Tu evaluación fue enviada');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingReview(false);
    }
  }

  if (!vet) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#94A3B8', fontSize: 16 }}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  const availableSlots = selectedDate ? getAvailableSlotsForDate(selectedDate) : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <ScrollView style={{ flex: 1 }}>
        {/* Blue header */}
        <View style={{ backgroundColor: '#1D4ED8', height: 180, alignItems: 'center', justifyContent: 'center' }}>
          {vet.photoUrl ? (
            <Image
              source={{ uri: vet.photoUrl }}
              style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#FFFFFF' }}
            />
          ) : (
            <View style={{
              width: 96, height: 96, borderRadius: 48,
              backgroundColor: '#EFF6FF',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 3, borderColor: '#FFFFFF',
            }}>
              <Text style={{ fontSize: 44 }}>🩺</Text>
            </View>
          )}
        </View>

        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            backgroundColor: 'rgba(255,255,255,0.85)',
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 16 }}>←</Text>
        </TouchableOpacity>

        <View style={{ paddingHorizontal: 20, marginTop: -32 }}>
          {/* Vet info card */}
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 3,
          }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1E293B' }}>Dr. {vet.name}</Text>
            <Text style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>Reg. {vet.licenseNumber}</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 }}>
              <Text style={{ fontSize: 13, color: '#64748B' }}>📍 {vet.address}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
              <Text style={{ fontSize: 13, color: '#64748B' }}>📞 {vet.phone}</Text>
            </View>

            {/* Fee badge */}
            <View style={{
              backgroundColor: '#DCFCE7',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 8,
              alignSelf: 'flex-start',
              marginTop: 10,
            }}>
              <Text style={{ color: '#16A34A', fontWeight: '700', fontSize: 15 }}>
                💰 ${vet.consultationFee ? vet.consultationFee.toLocaleString('es-CL') : '—'} CLP por consulta
              </Text>
            </View>

            {/* Rating */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <StarDisplay rating={vet.rating || 0} size={18} />
              <Text style={{ color: '#64748B', fontSize: 13 }}>
                {vet.rating ? vet.rating.toFixed(1) : 'Sin reseñas'}
                {vet.reviewCount ? ` (${vet.reviewCount} reseñas)` : ''}
              </Text>
            </View>

            {/* Specialties */}
            {vet.specialties && vet.specialties.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {vet.specialties.map((s) => (
                  <View key={s} style={{ backgroundColor: '#EFF6FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
                    <Text style={{ color: '#1D4ED8', fontSize: 12, fontWeight: '500' }}>{s}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Booking card */}
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
          }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#1E293B', marginBottom: 14 }}>
              📅 Agendar Cita
            </Text>

            {/* Pet selector */}
            <Text style={{ fontWeight: '600', color: '#475569', fontSize: 14, marginBottom: 8 }}>
              Selecciona tu mascota
            </Text>
            {pets.length === 0 ? (
              <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 12 }}>No tienes mascotas registradas</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {pets.map((pet) => (
                  <TouchableOpacity
                    key={pet.id}
                    onPress={() => setSelectedPet(pet.id)}
                    style={{
                      marginRight: 10,
                      borderRadius: 16,
                      padding: 12,
                      borderWidth: 2,
                      borderColor: selectedPet === pet.id ? '#1D4ED8' : '#E2E8F0',
                      backgroundColor: selectedPet === pet.id ? '#EFF6FF' : '#FFFFFF',
                      alignItems: 'center',
                      width: 80,
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                    <Text style={{ fontSize: 11, color: '#475569', marginTop: 4, textAlign: 'center' }}>{pet.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Reason */}
            <Text style={{ fontWeight: '600', color: '#475569', fontSize: 14, marginBottom: 8 }}>
              Motivo de consulta
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Describe el motivo de la consulta..."
              placeholderTextColor="#CBD5E1"
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: '#F8FAFC',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                padding: 12,
                fontSize: 14,
                color: '#1E293B',
                minHeight: 72,
                textAlignVertical: 'top',
                marginBottom: 14,
              }}
            />

            {/* Date strip */}
            <Text style={{ fontWeight: '600', color: '#475569', fontSize: 14, marginBottom: 8 }}>
              Selecciona fecha
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {days.map((day) => {
                const d = new Date(day + 'T00:00:00');
                const slots = getAvailableSlotsForDate(day);
                const isSelected = selectedDate === day;
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => { setSelectedDate(day); setSelectedTime(null); }}
                    style={{
                      marginRight: 10,
                      borderRadius: 16,
                      padding: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? '#1D4ED8' : '#E2E8F0',
                      backgroundColor: isSelected ? '#1D4ED8' : '#FFFFFF',
                      alignItems: 'center',
                      minWidth: 60,
                    }}
                  >
                    <Text style={{ fontSize: 11, color: isSelected ? '#BFDBFE' : '#94A3B8' }}>
                      {d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')}
                    </Text>
                    <Text style={{ fontWeight: '700', fontSize: 16, color: isSelected ? '#FFFFFF' : '#1E293B' }}>
                      {d.getDate()}
                    </Text>
                    <Text style={{ fontSize: 10, color: isSelected ? '#BFDBFE' : '#94A3B8', marginTop: 2 }}>
                      {slots.length > 0 ? `${slots.length} hrs` : 'Sin hrs'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Time slots */}
            {selectedDate && (
              <>
                <Text style={{ fontWeight: '600', color: '#475569', fontSize: 14, marginBottom: 8 }}>
                  Horarios disponibles
                </Text>
                {availableSlots.length === 0 ? (
                  <View style={{
                    backgroundColor: '#FEF2F2',
                    borderRadius: 12,
                    padding: 16,
                    alignItems: 'center',
                    marginBottom: 14,
                  }}>
                    <Text style={{ color: '#EF4444', fontSize: 13 }}>Sin horarios disponibles este día</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {availableSlots.map((time) => (
                      <TouchableOpacity
                        key={time}
                        onPress={() => setSelectedTime(time)}
                        style={{
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderWidth: 2,
                          borderColor: selectedTime === time ? '#1D4ED8' : '#E2E8F0',
                          backgroundColor: selectedTime === time ? '#EFF6FF' : '#FFFFFF',
                        }}
                      >
                        <Text style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: selectedTime === time ? '#1D4ED8' : '#64748B',
                        }}>
                          {time}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            <TouchableOpacity
              onPress={bookAppointment}
              disabled={!selectedDate || !selectedTime || !selectedPet || booking}
              style={{
                backgroundColor: (!selectedDate || !selectedTime || !selectedPet || booking) ? '#93C5FD' : '#1D4ED8',
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
                {booking ? 'Agendando...' : 'Agendar Cita'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Reviews section */}
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 20,
            marginBottom: 32,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#1E293B' }}>⭐ Reseñas</Text>
              {canReview && !showReviewForm && (
                <TouchableOpacity
                  onPress={() => setShowReviewForm(true)}
                  style={{
                    backgroundColor: '#1D4ED8',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>Evaluar</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Review form */}
            {showReviewForm && (
              <View style={{
                backgroundColor: '#EFF6FF',
                borderRadius: 16,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: '#BFDBFE',
              }}>
                <Text style={{ fontWeight: '600', color: '#1D4ED8', fontSize: 14, marginBottom: 10 }}>
                  Tu evaluación
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setReviewRating(star)}>
                      <Text style={{ fontSize: 30, color: star <= reviewRating ? '#F59E0B' : '#D1D5DB' }}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  value={reviewComment}
                  onChangeText={setReviewComment}
                  placeholder="Escribe tu comentario..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#BFDBFE',
                    padding: 12,
                    fontSize: 14,
                    color: '#1E293B',
                    minHeight: 72,
                    textAlignVertical: 'top',
                    marginBottom: 12,
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setShowReviewForm(false)}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#BFDBFE',
                    }}
                  >
                    <Text style={{ color: '#64748B', fontWeight: '600' }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={submitReview}
                    disabled={submittingReview}
                    style={{
                      flex: 2,
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      backgroundColor: submittingReview ? '#93C5FD' : '#1D4ED8',
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                      {submittingReview ? 'Enviando...' : 'Enviar evaluación'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Reviews list */}
            {reviews.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>💬</Text>
                <Text style={{ color: '#94A3B8', fontSize: 14 }}>Aún no hay reseñas</Text>
              </View>
            ) : (
              reviews.map((review) => (
                <View
                  key={review.id}
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: '#F1F5F9',
                    paddingVertical: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 14 }}>{review.ownerName}</Text>
                    <StarDisplay rating={review.rating} size={13} />
                  </View>
                  <Text style={{ color: '#475569', fontSize: 13, lineHeight: 18 }}>{review.comment}</Text>
                  <Text style={{ color: '#CBD5E1', fontSize: 11, marginTop: 4 }}>
                    {new Date(review.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
