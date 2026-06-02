import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Switch, Modal
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar } from 'react-native-calendars';
import { collection, addDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, uploadImages } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';

const { db } = initFirebase();

// Helpers to convert between calendar ISO (YYYY-MM-DD) and display DD-MM-YYYY
function toDisplay(iso: string) {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
function toISO(ddmmyyyy: string) {
  const clean = ddmmyyyy.replace(/[^0-9]/g, '');
  if (clean.length === 8) {
    return `${clean.slice(4)}-${clean.slice(2, 4)}-${clean.slice(0, 2)}`;
  }
  return ddmmyyyy;
}
function formatManual(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function DatePickerField({
  label,
  value,
  onChange,
  maxDate,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxDate?: string;
  error?: string;
}) {
  const [showCal, setShowCal] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const isoValue = value ? toISO(value) : '';
  const displayValue = value ? toDisplay(isoValue) : '';

  function handleCalDay(day: { dateString: string }) {
    onChange(toDisplay(day.dateString));
    setShowCal(false);
  }

  function handleManualChange(text: string) {
    onChange(formatManual(text));
  }

  return (
    <View>
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-sm font-medium text-gray-700">{label}</Text>
        <TouchableOpacity onPress={() => setManualMode(!manualMode)}>
          <Text className="text-xs text-primary-500 font-medium">
            {manualMode ? '📅 Usar calendario' : '⌨️ Ingresar manual'}
          </Text>
        </TouchableOpacity>
      </View>

      {manualMode ? (
        <TextInput
          className="border border-gray-200 rounded-xl bg-white px-4"
          style={{ height: 52, fontSize: 16, color: '#1F2937', textAlignVertical: 'center' }}
          placeholder="DD-MM-YYYY"
          placeholderTextColor="#9CA3AF"
          keyboardType="number-pad"
          value={value}
          onChangeText={handleManualChange}
          maxLength={10}
        />
      ) : (
        <>
          <TouchableOpacity
            className={`border rounded-xl bg-white flex-row items-center px-4 ${value ? 'border-primary-400' : 'border-gray-200'}`}
            style={{ height: 52 }}
            onPress={() => setShowCal(!showCal)}
          >
            <Text className="text-lg mr-3">📅</Text>
            <Text className={value ? 'text-gray-800 font-semibold text-base' : 'text-gray-400 text-base'}>
              {value || 'Seleccionar fecha'}
            </Text>
            {value && (
              <TouchableOpacity className="ml-auto" onPress={() => { onChange(''); setShowCal(false); }}>
                <Text className="text-gray-400">✕</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          {showCal && (
            <View className="mt-1 rounded-2xl overflow-hidden border border-gray-200">
              <Calendar
                onDayPress={handleCalDay}
                maxDate={maxDate || new Date().toISOString().split('T')[0]}
                markedDates={isoValue ? { [isoValue]: { selected: true, selectedColor: '#2D6A4F' } } : {}}
                theme={{ selectedDayBackgroundColor: '#2D6A4F', todayTextColor: '#2D6A4F', arrowColor: '#2D6A4F' }}
              />
            </View>
          )}
        </>
      )}

      {error && <Text className="text-red-500 text-xs mt-1">{error}</Text>}
    </View>
  );
}

const schema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  species: z.enum(['dog', 'cat', 'other']),
  breed: z.string().min(1, 'Raza requerida'),
  color: z.string().min(1, 'Color requerido'),
  birthDate: z.string().min(8, 'Fecha de nacimiento requerida'),
  familyDate: z.string().min(8, 'Fecha de unión requerida'),
  description: z.string().optional(),
  chipNumber: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function AddPetScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [lookingForPartner, setLookingForPartner] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { species: 'dog' },
  });

  async function pickPhoto() {
    Alert.alert('Agregar foto', '¿Cómo quieres agregar la foto?', [
      {
        text: 'Cámara',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permiso denegado', 'Necesitamos acceso a tu cámara.'); return; }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!result.canceled) setPhotos([...photos, result.assets[0].uri]);
        },
      },
      {
        text: 'Galería',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            quality: 0.8,
          });
          if (!result.canceled) setPhotos([...photos, ...result.assets.map((a) => a.uri)]);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  function removePhoto(index: number) {
    setPhotos(photos.filter((_, i) => i !== index));
  }

  async function onSubmit(data: FormData) {
    if (!user) return;
    setLoading(true);
    try {
      const photoUrls = await uploadImages(photos);
      await addDoc(collection(db, COLLECTIONS.PETS), {
        ownerId: user.uid,
        name: data.name,
        species: data.species,
        breed: data.breed,
        color: data.color,
        birthDate: toISO(data.birthDate),
        familyDate: toISO(data.familyDate),
        description: data.description || '',
        chipNumber: data.chipNumber || '',
        lookingForPartner,
        photos: photoUrls,
        medicalRecord: {
          vaccinations: [],
          allergies: [],
          conditions: [],
          notes: '',
          lastUpdated: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="px-6">
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-6">
            <Text className="text-primary-500 text-base">← Volver</Text>
          </TouchableOpacity>

          <Text className="text-2xl font-bold text-primary-700 mb-6">🐾 Nueva Mascota</Text>

          {/* Photo picker */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 mb-2">Fotos</Text>
            <View className="flex-row gap-2 flex-wrap">
              {photos.map((uri, i) => (
                <View key={i} className="w-20 h-20 rounded-xl overflow-hidden">
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  <TouchableOpacity
                    className="absolute top-1 right-1 bg-black/50 rounded-full w-5 h-5 items-center justify-center"
                    onPress={() => removePhoto(i)}
                  >
                    <Text className="text-white text-xs">✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                className="w-20 h-20 border-2 border-dashed border-primary-300 rounded-xl items-center justify-center bg-green-50"
                onPress={pickPhoto}
              >
                <Text className="text-2xl">📷</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Species */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 mb-2">Especie</Text>
            <Controller
              control={control}
              name="species"
              render={({ field: { onChange, value } }) => (
                <View className="flex-row gap-2">
                  {[{ id: 'dog', label: '🐕 Perro' }, { id: 'cat', label: '🐈 Gato' }, { id: 'other', label: '🐹 Otro' }].map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      className={`flex-1 py-3 rounded-xl border ${value === s.id ? 'bg-primary-500 border-primary-500' : 'bg-white border-gray-200'}`}
                      onPress={() => onChange(s.id)}
                    >
                      <Text className={`text-center text-sm font-medium ${value === s.id ? 'text-white' : 'text-gray-600'}`}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            />
          </View>

          <View className="gap-4">
            {/* Text fields */}
            {[
              { name: 'name' as const, label: 'Nombre', placeholder: 'Max' },
              { name: 'breed' as const, label: 'Raza', placeholder: 'Labrador Retriever' },
              { name: 'color' as const, label: 'Color', placeholder: 'Dorado' },
            ].map((f) => (
              <View key={f.name}>
                <Text className="text-sm font-medium text-gray-700 mb-1">{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      className="border border-gray-200 rounded-xl bg-white px-4"
                      style={{ height: 52, fontSize: 16, color: '#1F2937', textAlignVertical: 'center' }}
                      placeholder={f.placeholder}
                      placeholderTextColor="#9CA3AF"
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors[f.name] && <Text className="text-red-500 text-xs mt-1">{errors[f.name]?.message}</Text>}
              </View>
            ))}

            {/* Date pickers */}
            <Controller
              control={control}
              name="birthDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField
                  label="Fecha de nacimiento"
                  value={value}
                  onChange={onChange}
                  maxDate={today}
                  error={errors.birthDate?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="familyDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField
                  label="Fecha que se unió a la familia"
                  value={value}
                  onChange={onChange}
                  maxDate={today}
                  error={errors.familyDate?.message}
                />
              )}
            />

            {/* Optional fields */}
            {[
              { name: 'chipNumber' as const, label: 'Número de chip (opcional)', placeholder: '985121234567890', keyboard: 'number-pad' },
              { name: 'description' as const, label: 'Descripción (opcional)', placeholder: 'Describe a tu mascota...', multi: true },
            ].map((f) => (
              <View key={f.name}>
                <Text className="text-sm font-medium text-gray-700 mb-1">{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      className="border border-gray-200 rounded-xl bg-white px-4 py-3"
                      style={{ fontSize: 16, color: '#1F2937', textAlignVertical: f.multi ? 'top' : 'center', minHeight: f.multi ? 80 : 52 }}
                      placeholder={f.placeholder}
                      placeholderTextColor="#9CA3AF"
                      keyboardType={(f as any).keyboard}
                      multiline={f.multi}
                      numberOfLines={f.multi ? 3 : 1}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
              </View>
            ))}

            {/* Looking for partner */}
            <View className="flex-row justify-between items-center bg-white rounded-xl p-4 border border-gray-200">
              <View>
                <Text className="font-medium text-gray-800">💕 Busca Pareja</Text>
                <Text className="text-gray-400 text-xs">Aparecerá en la sección Match</Text>
              </View>
              <Switch
                value={lookingForPartner}
                onValueChange={setLookingForPartner}
                trackColor={{ false: '#D1D5DB', true: '#52B788' }}
                thumbColor={lookingForPartner ? '#2D6A4F' : '#F3F4F6'}
              />
            </View>
          </View>

          <TouchableOpacity
            className={`bg-primary-500 rounded-2xl py-4 items-center mt-6 mb-10 ${loading ? 'opacity-70' : ''}`}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            <Text className="text-white font-semibold text-base">
              {loading ? 'Guardando...' : 'Agregar Mascota'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
