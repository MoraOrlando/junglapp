import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, addDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import YearCalendar from '../../../components/YearCalendar';
import type { Pet } from '@junglapp/types';

const { db } = initFirebase();

const REGIONS = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

// `lastSeenDate` is stored as YYYY-MM-DD (consistent with dates elsewhere in
// the app), but shown to the user as DD-MM-YYYY.
function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ReportLostPetScreen() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [lastSeenLocation, setLastSeenLocation] = useState('');
  const [lastSeenDate, setLastSeenDate] = useState('');
  const [showDateCalendar, setShowDateCalendar] = useState(false);
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState('Metropolitana');
  const [state, setState] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [characteristics, setCharacteristics] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  useEffect(() => {
    if (!petId) return;
    getDoc(doc(db, COLLECTIONS.PETS, petId)).then((snap) => {
      if (snap.exists()) {
        const p = { id: snap.id, ...snap.data() } as Pet;
        setPet(p);
        setDescription(p.description || '');
        setContactPhone(user?.phone || '');
      }
    }).catch(() => {});
  }, [petId]);

  async function publish() {
    if (!pet || !user) return;
    if (!lastSeenLocation || !lastSeenDate || !region) {
      Alert.alert('Campos requeridos', 'Completa la última ubicación, fecha y región');
      return;
    }
    setSaving(true);
    try {
      // Guard against duplicate active reports for the same pet — the
      // pet-detail screen's "already reported" check only reflects state
      // fetched at mount time, so it can go stale and let the user reach
      // this screen twice for the same pet. This is the actual write path,
      // so it must not trust the caller already verified that.
      const existing = await getDocs(
        query(
          collection(db, COLLECTIONS.LOST_PETS),
          where('petId', '==', pet.id),
          where('isFound', '==', false),
          limit(1),
        )
      );
      if (!existing.empty) {
        Alert.alert('Ya reportada', `${pet.name} ya está publicada como extraviada.`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      // Capture reporter coordinates so the lost pet appears on the map
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch {}

      await addDoc(collection(db, COLLECTIONS.LOST_PETS), {
        petId: pet.id,
        ownerId: user.uid,
        ownerName: user.name,
        petName: pet.name,
        petSpecies: pet.species,
        petBreed: pet.breed,
        petColor: pet.color,
        petPhotos: pet.photos,
        chipNumber: pet.chipNumber || '',
        region,
        state,
        description,
        characteristics,
        lastSeenDate,
        lastSeenLocation,
        contactPhone,
        contactEmail: user.email,
        lat,
        lng,
        isFound: false,
        reportedAt: new Date().toISOString(),
      });

      Alert.alert(
        '🔍 ¡Publicado!',
        `${pet.name} está publicada como extraviada. Los usuarios en la región ${region} podrán verla y ayudarte a encontrarla.`,
        [{ text: 'OK', onPress: () => { router.back(); router.back(); } }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!pet) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1">
          {/* Header */}
          <View className="bg-red-500 px-6 pb-8 pt-4">
            <TouchableOpacity onPress={() => router.back()} className="mb-4">
              <Text className="text-white text-base">← Volver</Text>
            </TouchableOpacity>
            <Text className="text-white text-2xl font-bold">🔍 Reportar Extraviada</Text>
            <Text className="text-white/70 text-sm mt-1">La publicación será visible para usuarios cercanos</Text>
          </View>

          <View className="px-6 -mt-4">
            {/* Pet info card (pre-filled, read-only) */}
            <View className="bg-white rounded-2xl p-4 shadow-md mb-6">
              <Text className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Información de la mascota</Text>
              <View className="flex-row items-center gap-4">
                <View className="bg-primary-100 rounded-2xl w-16 h-16 items-center justify-center">
                  <Text className="text-3xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-bold text-gray-800">{pet.name}</Text>
                  <Text className="text-gray-500">{pet.breed} · {pet.color}</Text>
                  {pet.chipNumber && (
                    <Text className="text-gray-400 text-xs mt-0.5">Chip: {pet.chipNumber}</Text>
                  )}
                </View>
              </View>

              {pet.medicalRecord.allergies.length > 0 && (
                <View className="mt-3 bg-red-50 rounded-xl p-2">
                  <Text className="text-red-500 text-xs">⚠️ Alergias: {pet.medicalRecord.allergies.join(', ')}</Text>
                </View>
              )}
            </View>

            {/* Additional info form */}
            <Text className="text-gray-700 font-semibold text-base mb-3">Información adicional</Text>

            <View className="gap-4">
              {/* Region */}
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Región donde se extravió *</Text>
                <TouchableOpacity
                  className="border border-gray-200 rounded-xl px-4 py-3 bg-white flex-row justify-between items-center"
                  onPress={() => setShowRegionPicker(!showRegionPicker)}
                >
                  <Text className="text-base text-gray-800">{region}</Text>
                  <Text className="text-gray-400">{showRegionPicker ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {showRegionPicker && (
                  <View className="border border-gray-200 rounded-xl mt-1 bg-white overflow-hidden max-h-48">
                    <ScrollView nestedScrollEnabled>
                      {REGIONS.map((r) => (
                        <TouchableOpacity
                          key={r}
                          className={`px-4 py-3 border-b border-gray-50 ${r === region ? 'bg-primary-50' : ''}`}
                          onPress={() => { setRegion(r); setShowRegionPicker(false); }}
                        >
                          <Text className={`text-sm ${r === region ? 'text-primary-600 font-semibold' : 'text-gray-700'}`}>{r}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* City/State */}
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Ciudad / Comuna</Text>
                <TextInput
                  className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                  placeholder="Ej: Las Condes, Santiago"
                  value={state}
                  onChangeText={setState}
                />
              </View>

              {/* Last seen location */}
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Último lugar donde fue visto/a *</Text>
                <TextInput
                  className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                  placeholder="Ej: Parque Araucano, Av. Manquehue"
                  value={lastSeenLocation}
                  onChangeText={setLastSeenLocation}
                />
              </View>

              {/* Last seen date */}
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Fecha de extravío *</Text>
                <TouchableOpacity
                  className={`border rounded-xl px-4 py-3 bg-white flex-row items-center gap-2 ${lastSeenDate ? 'border-primary-400' : 'border-gray-200'}`}
                  onPress={() => setShowDateCalendar(!showDateCalendar)}
                >
                  <Text className="text-lg">📅</Text>
                  <Text className={`text-base ${lastSeenDate ? 'text-gray-800' : 'text-gray-400'}`}>
                    {lastSeenDate ? toDisplayDate(lastSeenDate) : 'DD-MM-YYYY'}
                  </Text>
                </TouchableOpacity>

                {showDateCalendar && (
                  <View className="mt-2 rounded-2xl overflow-hidden border border-gray-200">
                    <YearCalendar
                      onDayPress={(day) => { setLastSeenDate(day.dateString); setShowDateCalendar(false); }}
                      maxDate={toLocalDateString(new Date())}
                      initialDate={lastSeenDate || undefined}
                      markedDates={lastSeenDate ? { [lastSeenDate]: { selected: true, selectedColor: '#2D6A4F' } } : {}}
                    />
                  </View>
                )}
              </View>

              {/* Characteristics */}
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Características especiales al momento del extravío</Text>
                <TextInput
                  className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                  placeholder="Ej: Lleva collar rojo, tiene cicatriz en pata derecha..."
                  value={characteristics}
                  onChangeText={setCharacteristics}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Description */}
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Descripción adicional</Text>
                <TextInput
                  className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                  placeholder="Cualquier información que ayude a identificarla..."
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Contact phone */}
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Teléfono de contacto *</Text>
                <TextInput
                  className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                  placeholder="+56 9 1234 5678"
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            {/* Alert info box */}
            <View className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mt-4">
              <Text className="text-orange-700 text-sm font-medium mb-1">📢 ¿Qué ocurre al publicar?</Text>
              <Text className="text-orange-600 text-xs leading-relaxed">
                • Tu mascota aparecerá en la sección "Mascotas Extraviadas" para usuarios de la región {region}.{'\n'}
                • Quien la encuentre podrá marcarla como "Encontrada" y se abrirá un chat directo contigo.{'\n'}
                • Recibirás una notificación inmediata cuando alguien la reporte.
              </Text>
            </View>

            <TouchableOpacity
              className={`bg-red-500 rounded-2xl py-4 items-center mt-6 mb-10 ${saving ? 'opacity-70' : ''}`}
              onPress={publish}
              disabled={saving}
            >
              <Text className="text-white font-bold text-base">
                {saving ? 'Publicando...' : '🔍 Publicar Mascota Extraviada'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
