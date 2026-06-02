import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoCalendar from 'expo-calendar';
import {
  collection, addDoc, query, where, getDocs, orderBy, limit, doc, getDoc
} from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View className="flex-row gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)}>
          <Text className="text-3xl">{star <= value ? '⭐' : '☆'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AddVisitScreen() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const router = useRouter();

  const [vetName, setVetName] = useState('');
  const [vetSuggestions, setVetSuggestions] = useState<Veterinarian[]>([]);
  const [selectedVet, setSelectedVet] = useState<Veterinarian | null>(null);
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [prescriptionUri, setPrescriptionUri] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [nextControlDate, setNextControlDate] = useState('');
  const [vetAvailability, setVetAvailability] = useState<string[] | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [saving, setSaving] = useState(false);

  // Autocomplete: search registered vets as user types
  useEffect(() => {
    if (vetName.length < 2) { setVetSuggestions([]); setSelectedVet(null); return; }
    const lower = vetName.toLowerCase();
    getDocs(query(
      collection(db, COLLECTIONS.VETERINARIANS),
      where('status', '==', 'approved'),
      limit(5)
    )).then((snap) => {
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Veterinarian))
        .filter((v) => v.name.toLowerCase().includes(lower));
      setVetSuggestions(matches);
    });
  }, [vetName]);

  // Check vet availability when date is selected
  async function handleDateSelect(day: { dateString: string }) {
    setNextControlDate(day.dateString);
    setShowCalendar(false);
    setVetAvailability(null);
    if (!selectedVet) return;

    setCheckingAvailability(true);
    const snap = await getDoc(doc(db, COLLECTIONS.VETERINARIANS, selectedVet.id));
    if (snap.exists()) {
      const vetData = snap.data();
      const slots: string[] = vetData?.availability?.[day.dateString] ?? [];
      setVetAvailability(slots);
    }
    setCheckingAvailability(false);
  }

  async function pickPrescription() {
    Alert.alert('Subir receta', '¿Cómo quieres agregar la foto?', [
      {
        text: 'Cámara', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!result.canceled) setPrescriptionUri(result.assets[0].uri);
        },
      },
      {
        text: 'Galería', onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
          if (!result.canceled) setPrescriptionUri(result.assets[0].uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function addToDeviceCalendar() {
    try {
      const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'No se pudo acceder al calendario.');
        return;
      }
      const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
      const defaultCal = calendars.find((c) => c.allowsModifications) ?? calendars[0];
      if (!defaultCal) return;

      const date = new Date(nextControlDate + 'T10:00:00');
      await ExpoCalendar.createEventAsync(defaultCal.id, {
        title: `Control veterinario ${vetName ? `— ${vetName}` : ''}`,
        startDate: date,
        endDate: new Date(date.getTime() + 60 * 60 * 1000),
        notes: `Recordatorio de control veterinario registrado en JunglApp`,
        alarms: [{ relativeOffset: -60 }],
      });
      Alert.alert('✅ Listo', 'Recordatorio agregado a tu calendario.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleBookNow() {
    if (!selectedVet || !nextControlDate) return;
    router.push(`/(owner)/vets/${selectedVet.id}?bookDate=${nextControlDate}` as any);
  }

  async function handleSave() {
    if (!petId) return;
    if (rating === 0) { Alert.alert('Faltan datos', 'Por favor califica el servicio.'); return; }
    setSaving(true);
    try {
      let prescriptionUrl: string | undefined;
      if (prescriptionUri) prescriptionUrl = await uploadImage(prescriptionUri);

      await addDoc(collection(db, COLLECTIONS.MEDICAL_VISITS), {
        petId,
        date: new Date().toISOString().split('T')[0],
        vetName: selectedVet?.name || vetName,
        vetId: selectedVet?.id || null,
        rating,
        notes,
        prescriptionUrl: prescriptionUrl || null,
        nextControlDate: nextControlDate || null,
        createdAt: new Date().toISOString(),
      });

      Alert.alert('✅ Visita registrada', 'La visita quedó guardada en la ficha médica.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-4">
            <Text className="text-primary-500 text-base">← Volver</Text>
          </TouchableOpacity>

          <Text className="text-2xl font-bold text-primary-700 mb-6">🏥 Registrar Visita</Text>

          {/* Prescription photo */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Foto de la receta (opcional)</Text>
            <TouchableOpacity
              className="border-2 border-dashed border-primary-300 rounded-2xl overflow-hidden items-center justify-center bg-green-50"
              style={{ height: 120 }}
              onPress={pickPrescription}
            >
              {prescriptionUri ? (
                <Image source={{ uri: prescriptionUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <View className="items-center">
                  <Text className="text-3xl mb-1">📄</Text>
                  <Text className="text-primary-600 text-sm font-medium">Subir foto de receta</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Vet name with autocomplete */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Veterinario que la atendió</Text>
            <View className="relative">
              <View className="border border-gray-200 rounded-xl bg-white flex-row items-center px-4">
                <Text className="text-lg mr-2">🩺</Text>
                <TextInput
                  className="flex-1 py-3 text-base text-gray-800"
                  placeholder="Nombre del veterinario..."
                  value={selectedVet ? `Dr. ${selectedVet.name}` : vetName}
                  onChangeText={(t) => { setVetName(t); setSelectedVet(null); }}
                />
                {selectedVet && <Text className="text-green-500 text-lg">✓</Text>}
              </View>

              {/* Suggestions dropdown */}
              {vetSuggestions.length > 0 && !selectedVet && (
                <View className="bg-white border border-gray-200 rounded-xl mt-1 overflow-hidden">
                  {vetSuggestions.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      className="px-4 py-3 border-b border-gray-50 flex-row items-center gap-3"
                      onPress={() => { setSelectedVet(v); setVetName(v.name); setVetSuggestions([]); }}
                    >
                      <View className="bg-blue-100 rounded-full w-8 h-8 items-center justify-center">
                        <Text className="text-sm">🩺</Text>
                      </View>
                      <View>
                        <Text className="font-semibold text-gray-800">Dr. {v.name}</Text>
                        <Text className="text-gray-400 text-xs">{v.address}</Text>
                      </View>
                      <Text className="text-green-500 text-xs ml-auto">Registrado ✓</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {selectedVet && (
                <View className="mt-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <Text className="text-blue-700 text-xs font-medium">✓ Veterinario registrado en JunglApp</Text>
                  <Text className="text-blue-500 text-xs mt-0.5">{selectedVet.address}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Rating */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">¿Cómo fue el servicio?</Text>
            <View className="bg-white border border-gray-200 rounded-xl p-4">
              <StarRating value={rating} onChange={setRating} />
              {rating > 0 && (
                <Text className="text-gray-400 text-xs mt-2">
                  {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'][rating]}
                </Text>
              )}
            </View>
          </View>

          {/* Notes */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Notas de la visita (opcional)</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base"
              placeholder="Diagnóstico, medicamentos recetados, observaciones..."
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
          </View>

          {/* Next control date */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Próximo control (opcional)</Text>
            <TouchableOpacity
              className={`bg-white border rounded-xl px-4 py-3 flex-row items-center gap-3 ${nextControlDate ? 'border-primary-400' : 'border-gray-200'}`}
              onPress={() => setShowCalendar(!showCalendar)}
            >
              <Text className="text-xl">📅</Text>
              <Text className={nextControlDate ? 'text-primary-700 font-semibold' : 'text-gray-400'}>
                {nextControlDate || 'Seleccionar fecha'}
              </Text>
              {nextControlDate && (
                <TouchableOpacity className="ml-auto" onPress={() => { setNextControlDate(''); setVetAvailability(null); }}>
                  <Text className="text-gray-400 text-sm">✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {showCalendar && (
              <View className="mt-2 rounded-2xl overflow-hidden border border-gray-200">
                <Calendar
                  onDayPress={handleDateSelect}
                  minDate={new Date().toISOString().split('T')[0]}
                  markedDates={nextControlDate ? { [nextControlDate]: { selected: true, selectedColor: '#2D6A4F' } } : {}}
                  theme={{ selectedDayBackgroundColor: '#2D6A4F', todayTextColor: '#2D6A4F', arrowColor: '#2D6A4F' }}
                />
              </View>
            )}

            {/* Availability feedback */}
            {nextControlDate && (
              <View className="mt-3">
                {checkingAvailability ? (
                  <Text className="text-gray-400 text-sm text-center">Consultando agenda...</Text>
                ) : selectedVet && vetAvailability !== null ? (
                  vetAvailability.length > 0 ? (
                    <View className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <Text className="text-green-700 font-semibold text-sm">✅ Dr. {selectedVet.name} tiene disponibilidad el {nextControlDate}</Text>
                      <Text className="text-green-600 text-xs mt-1">Horarios: {vetAvailability.join(', ')}</Text>
                      <TouchableOpacity
                        className="bg-green-500 rounded-xl py-2 items-center mt-3"
                        onPress={handleBookNow}
                      >
                        <Text className="text-white font-semibold text-sm">📅 Agendar ahora</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <Text className="text-amber-700 font-semibold text-sm">📅 Dr. {selectedVet.name} no tiene horarios disponibles ese día</Text>
                      <Text className="text-amber-600 text-xs mt-1">Puedes contactarlo directamente o elegir otra fecha.</Text>
                    </View>
                  )
                ) : !selectedVet ? (
                  <View className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <Text className="text-blue-700 text-sm font-semibold">Veterinario no registrado en JunglApp</Text>
                    <Text className="text-blue-500 text-xs mt-1">¿Quieres agregar un recordatorio a tu calendario?</Text>
                    <TouchableOpacity
                      className="bg-blue-500 rounded-xl py-2 items-center mt-3"
                      onPress={addToDeviceCalendar}
                    >
                      <Text className="text-white font-semibold text-sm">📲 Agregar recordatorio</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <TouchableOpacity
            className={`bg-primary-500 rounded-2xl py-4 items-center ${saving ? 'opacity-70' : ''}`}
            onPress={handleSave}
            disabled={saving}
          >
            <Text className="text-white font-bold text-base">
              {saving ? 'Guardando...' : '✅ Registrar Visita'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
