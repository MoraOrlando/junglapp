import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import YearCalendar from '../../../components/YearCalendar';
import { collection, addDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, uploadImages } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';

const { db } = initFirebase();

// YYYY-MM-DD → DD-MM-YYYY
function toDisplay(iso: string) {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
// DD-MM-YYYY → YYYY-MM-DD
function toISO(ddmmyyyy: string) {
  const clean = ddmmyyyy.replace(/\D/g, '');
  if (clean.length === 8) return `${clean.slice(4)}-${clean.slice(2, 4)}-${clean.slice(0, 2)}`;
  return ddmmyyyy;
}
// Auto-format digits as DD-MM-YYYY
function fmtManual(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
}

const PRIMARY = '#2D6A4F';
const PRIMARY_LIGHT = '#e8f5ee';
const BORDER = '#E5E7EB';
const GRAY_TEXT = '#6B7280';
const DARK_TEXT = '#1F2937';

function DatePickerField({
  label, value, onChange, maxDate, error,
}: {
  label: string; value: string; onChange: (v: string) => void; maxDate?: string; error?: string;
}) {
  const [showCal, setShowCal] = useState(false);
  const [manual, setManual] = useState(false);
  const iso = value ? toISO(value) : '';

  return (
    <View style={{ marginBottom: 4 }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151' }}>{label}</Text>
        <TouchableOpacity onPress={() => { setManual(!manual); setShowCal(false); }}>
          <Text style={{ fontSize: 12, color: PRIMARY, fontWeight: '500' }}>
            {manual ? '📅 Usar calendario' : '⌨️  Ingresar manual'}
          </Text>
        </TouchableOpacity>
      </View>

      {manual ? (
        /* Manual text input */
        <TextInput
          style={{
            height: 52, borderWidth: 1, borderColor: BORDER, borderRadius: 12,
            backgroundColor: 'white', paddingHorizontal: 16,
            fontSize: 16, color: DARK_TEXT, textAlignVertical: 'center',
          }}
          placeholder="DD-MM-YYYY"
          placeholderTextColor="#9CA3AF"
          keyboardType="number-pad"
          value={value}
          onChangeText={(t) => onChange(fmtManual(t))}
          maxLength={10}
        />
      ) : (
        <>
          {/* Selector button */}
          <TouchableOpacity
            style={{
              height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: 'white',
              borderColor: value ? PRIMARY : BORDER,
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
            }}
            onPress={() => setShowCal(!showCal)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 18, marginRight: 10 }}>📅</Text>
            <Text style={{ flex: 1, fontSize: 15, color: value ? DARK_TEXT : '#9CA3AF', fontWeight: value ? '600' : '400' }}>
              {value || 'Toca para abrir calendario'}
            </Text>
            {value ? (
              <TouchableOpacity onPress={() => { onChange(''); setShowCal(false); }}>
                <Text style={{ color: '#9CA3AF', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: GRAY_TEXT }}>▾</Text>
            )}
          </TouchableOpacity>

          {/* Inline calendar */}
          {showCal && (
            <View style={{ marginTop: 6, borderWidth: 1, borderColor: BORDER, borderRadius: 16, overflow: 'hidden', backgroundColor: 'white' }}>
              <YearCalendar
                onDayPress={(day: { dateString: string }) => {
                  onChange(toDisplay(day.dateString));
                  setShowCal(false);
                }}
                maxDate={maxDate || new Date().toISOString().split('T')[0]}
                initialDate={iso || undefined}
                markedDates={iso ? { [iso]: { selected: true, selectedColor: PRIMARY } } : {}}
                color={PRIMARY}
              />
            </View>
          )}
        </>
      )}

      {error && <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{error}</Text>}
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

const inputStyle = {
  height: 52, borderWidth: 1, borderColor: BORDER, borderRadius: 12,
  backgroundColor: 'white', paddingHorizontal: 16,
  fontSize: 16, color: DARK_TEXT, textAlignVertical: 'center' as const,
};

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
          if (!result.canceled) setPhotos((p) => [...p, result.assets[0].uri]);
        },
      },
      {
        text: 'Galería',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaType.Images,
            allowsMultipleSelection: true, quality: 0.8,
          });
          if (!result.canceled) setPhotos((p) => [...p, ...result.assets.map((a) => a.uri)]);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function onSubmit(data: FormData) {
    if (!user) return;
    setLoading(true);
    try {
      const photoUrls = await uploadImages(photos);
      await addDoc(collection(db, COLLECTIONS.PETS), {
        ownerId: user.uid,
        ownerEmail: user.email || '',
        ownerRut: (user as any).rut || '',
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
        medicalRecord: { vaccinations: [], allergies: [], conditions: [], notes: '', lastUpdated: new Date().toISOString() },
        createdAt: new Date().toISOString(),
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Error al guardar', e.message);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 24 }}>
            <Text style={{ color: PRIMARY, fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 22, fontWeight: '700', color: PRIMARY, marginBottom: 24 }}>🐾 Nueva Mascota</Text>

          {/* Photos */}
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 8 }}>Fotos</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {photos.map((uri, i) => (
              <View key={i} style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden' }}>
                <Image source={{ uri }} style={{ width: 80, height: 80 }} contentFit="cover" />
                <TouchableOpacity
                  style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
                >
                  <Text style={{ color: 'white', fontSize: 10 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={{ width: 80, height: 80, borderWidth: 2, borderStyle: 'dashed', borderColor: '#86efac', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: PRIMARY_LIGHT }}
              onPress={pickPhoto}
            >
              <Text style={{ fontSize: 28 }}>📷</Text>
            </TouchableOpacity>
          </View>

          {/* Species */}
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 8 }}>Especie</Text>
          <Controller
            control={control}
            name="species"
            render={({ field: { onChange, value } }) => (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                {[{ id: 'dog', label: '🐕 Perro' }, { id: 'cat', label: '🐈 Gato' }, { id: 'other', label: '🐹 Otro' }].map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={{
                      flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
                      borderColor: value === s.id ? PRIMARY : BORDER,
                      backgroundColor: value === s.id ? PRIMARY : 'white',
                      alignItems: 'center',
                    }}
                    onPress={() => onChange(s.id)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: value === s.id ? 'white' : GRAY_TEXT }}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          />

          {/* Text fields */}
          <View style={{ gap: 16 }}>
            {([
              { name: 'name' as const, label: 'Nombre', placeholder: 'Max' },
              { name: 'breed' as const, label: 'Raza', placeholder: 'Labrador Retriever' },
              { name: 'color' as const, label: 'Color', placeholder: 'Dorado' },
            ]).map((f) => (
              <View key={f.name}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 }}>{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, value } }) => (
                    <TextInput style={inputStyle} placeholder={f.placeholder} placeholderTextColor="#9CA3AF" onChangeText={onChange} value={value} />
                  )}
                />
                {errors[f.name] && <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{errors[f.name]?.message}</Text>}
              </View>
            ))}

            {/* Date pickers */}
            <Controller
              control={control}
              name="birthDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField label="Fecha de nacimiento" value={value} onChange={onChange} maxDate={today} error={errors.birthDate?.message} />
              )}
            />
            <Controller
              control={control}
              name="familyDate"
              render={({ field: { onChange, value } }) => (
                <DatePickerField label="Fecha que se unió a la familia" value={value} onChange={onChange} maxDate={today} error={errors.familyDate?.message} />
              )}
            />

            {/* Optional fields */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 }}>Número de chip (opcional)</Text>
              <Controller
                control={control}
                name="chipNumber"
                render={({ field: { onChange, value } }) => (
                  <TextInput style={inputStyle} placeholder="985121234567890" placeholderTextColor="#9CA3AF" keyboardType="number-pad" onChangeText={onChange} value={value} />
                )}
              />
            </View>

            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 }}>Descripción (opcional)</Text>
              <Controller
                control={control}
                name="description"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={{ ...inputStyle, height: 88, textAlignVertical: 'top', paddingTop: 12 }}
                    placeholder="Describe a tu mascota..."
                    placeholderTextColor="#9CA3AF"
                    multiline numberOfLines={3}
                    onChangeText={onChange} value={value}
                  />
                )}
              />
            </View>

            {/* Looking for partner */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER }}>
              <View>
                <Text style={{ fontWeight: '600', color: DARK_TEXT, fontSize: 15 }}>💕 Busca Pareja</Text>
                <Text style={{ color: GRAY_TEXT, fontSize: 12, marginTop: 2 }}>Aparecerá en la sección Match</Text>
              </View>
              <Switch
                value={lookingForPartner}
                onValueChange={setLookingForPartner}
                trackColor={{ false: '#D1D5DB', true: '#52B788' }}
                thumbColor={lookingForPartner ? PRIMARY : '#F3F4F6'}
              />
            </View>
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: loading ? '#86efac' : PRIMARY,
              borderRadius: 16, paddingVertical: 16, alignItems: 'center',
              marginTop: 24, marginBottom: 40,
            }}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>
              {loading ? 'Guardando...' : 'Agregar Mascota'}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
