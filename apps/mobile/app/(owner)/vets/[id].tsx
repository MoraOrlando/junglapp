import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Veterinarian, Pet } from '@junglapp/types';

const { db } = initFirebase();

const TIME_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

function getNextDays(n: number) {
  const days = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
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
  const [booking, setBooking] = useState(false);

  const days = getNextDays(7);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.VETERINARIANS, id)).then((snap) => {
      if (snap.exists()) setVet({ id: snap.id, ...snap.data() } as Veterinarian);
    });
    if (user) {
      getDocs(query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))).then((snap) => {
        setPets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));
      });
    }
  }, [id, user]);

  function getAvailableSlots(date: string) {
    if (!vet?.availability?.[date]) return TIME_SLOTS;
    return TIME_SLOTS.filter((t) => !vet.availability[date].includes(t));
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
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      Alert.alert('¡Listo!', 'Cita agendada correctamente', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBooking(false);
    }
  }

  if (!vet) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <View className="bg-blue-500 h-40 items-center justify-center">
          <Text className="text-7xl">🩺</Text>
        </View>
        <TouchableOpacity className="absolute top-10 left-4 bg-white/80 rounded-full p-2" onPress={() => router.back()}>
          <Text className="text-blue-700 text-base px-1">←</Text>
        </TouchableOpacity>

        <View className="px-6 -mt-6">
          <View className="bg-white rounded-2xl p-5 shadow-md mb-4">
            <Text className="text-2xl font-bold text-gray-800">Dr. {vet.name}</Text>
            <Text className="text-gray-500 mt-1">{vet.address}</Text>
            <Text className="text-gray-500 text-sm">{vet.phone}</Text>
            <View className="flex-row justify-between items-center mt-3">
              <Text className="text-primary-600 font-bold text-lg">
                ${vet.consultationFee.toLocaleString()} CLP
              </Text>
              <Text className="text-gray-400 text-sm">Reg. {vet.licenseNumber}</Text>
            </View>
            {vet.specialties.length > 0 && (
              <View className="flex-row gap-2 flex-wrap mt-2">
                {vet.specialties.map((s) => (
                  <View key={s} className="bg-blue-50 rounded-full px-3 py-1">
                    <Text className="text-blue-600 text-xs">{s}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Pet selection */}
          <Text className="text-gray-700 font-semibold text-base mb-2">Selecciona tu mascota</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            {pets.map((pet) => (
              <TouchableOpacity
                key={pet.id}
                className={`mr-3 rounded-2xl p-3 border-2 items-center w-24 ${selectedPet === pet.id ? 'border-primary-500 bg-green-50' : 'border-gray-200 bg-white'}`}
                onPress={() => setSelectedPet(pet.id)}
              >
                <Text className="text-2xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                <Text className="text-xs text-gray-700 mt-1 text-center">{pet.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Date selection */}
          <Text className="text-gray-700 font-semibold text-base mb-2">Selecciona fecha</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            {days.map((day) => {
              const d = new Date(day + 'T00:00:00');
              return (
                <TouchableOpacity
                  key={day}
                  className={`mr-3 rounded-2xl p-3 border-2 items-center w-16 ${selectedDate === day ? 'border-primary-500 bg-green-50' : 'border-gray-200 bg-white'}`}
                  onPress={() => { setSelectedDate(day); setSelectedTime(null); }}
                >
                  <Text className="text-xs text-gray-500">{d.toLocaleDateString('es-CL', { weekday: 'short' })}</Text>
                  <Text className="font-bold text-gray-800">{d.getDate()}</Text>
                  <Text className="text-xs text-gray-400">{d.toLocaleDateString('es-CL', { month: 'short' })}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Time slots */}
          {selectedDate && (
            <>
              <Text className="text-gray-700 font-semibold text-base mb-2">Hora disponible</Text>
              <View className="flex-row flex-wrap gap-2 mb-6">
                {getAvailableSlots(selectedDate).map((time) => (
                  <TouchableOpacity
                    key={time}
                    className={`rounded-xl px-4 py-2 border ${selectedTime === time ? 'bg-primary-500 border-primary-500' : 'bg-white border-gray-200'}`}
                    onPress={() => setSelectedTime(time)}
                  >
                    <Text className={`text-sm font-medium ${selectedTime === time ? 'text-white' : 'text-gray-700'}`}>{time}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity
            className={`bg-primary-500 rounded-2xl py-4 items-center mb-10 ${(!selectedDate || !selectedTime || !selectedPet || booking) ? 'opacity-50' : ''}`}
            onPress={bookAppointment}
            disabled={!selectedDate || !selectedTime || !selectedPet || booking}
          >
            <Text className="text-white font-semibold text-base">
              {booking ? 'Agendando...' : 'Agendar Cita'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
