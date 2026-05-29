import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';

const { db, storage } = initFirebase();

const schema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  species: z.enum(['dog', 'cat', 'other']),
  breed: z.string().min(1, 'Raza requerida'),
  color: z.string().min(1, 'Color requerido'),
  birthDate: z.string().min(1, 'Fecha nacimiento requerida'),
  familyDate: z.string().min(1, 'Fecha de unión requerida'),
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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotos([...photos, ...result.assets.map((a) => a.uri)]);
    }
  }

  async function onSubmit(data: FormData) {
    if (!user) return;
    setLoading(true);
    try {
      // Upload photos
      const photoUrls: string[] = [];
      for (const photoUri of photos) {
        const photoRef = ref(storage, `pets/${Date.now()}_${Math.random().toString(36).slice(2)}`);
        const response = await fetch(photoUri);
        const blob = await response.blob();
        await uploadBytes(photoRef, blob);
        photoUrls.push(await getDownloadURL(photoRef));
      }

      await addDoc(collection(db, COLLECTIONS.PETS), {
        ownerId: user.uid,
        name: data.name,
        species: data.species,
        breed: data.breed,
        color: data.color,
        birthDate: data.birthDate,
        familyDate: data.familyDate,
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
                <View key={i} className="w-20 h-20 bg-gray-100 rounded-xl overflow-hidden">
                  <Text className="text-3xl text-center mt-4">🖼️</Text>
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

          {/* Species selector */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 mb-2">Especie</Text>
            <Controller
              control={control}
              name="species"
              render={({ field: { onChange, value } }) => (
                <View className="flex-row gap-2">
                  {[
                    { id: 'dog', label: '🐕 Perro' },
                    { id: 'cat', label: '🐈 Gato' },
                    { id: 'other', label: '🐹 Otro' },
                  ].map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      className={`flex-1 py-2 rounded-xl border ${value === s.id ? 'bg-primary-500 border-primary-500' : 'bg-white border-gray-200'}`}
                      onPress={() => onChange(s.id)}
                    >
                      <Text className={`text-center text-sm font-medium ${value === s.id ? 'text-white' : 'text-gray-600'}`}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            />
          </View>

          <View className="gap-4">
            {[
              { name: 'name' as const, label: 'Nombre', placeholder: 'Max' },
              { name: 'breed' as const, label: 'Raza', placeholder: 'Labrador Retriever' },
              { name: 'color' as const, label: 'Color', placeholder: 'Dorado' },
              { name: 'birthDate' as const, label: 'Fecha de nacimiento (YYYY-MM-DD)', placeholder: '2020-03-15' },
              { name: 'familyDate' as const, label: 'Fecha que se unió a la familia', placeholder: '2020-06-01' },
              { name: 'chipNumber' as const, label: 'Número de chip (opcional)', placeholder: '985121234567890' },
              { name: 'description' as const, label: 'Descripción (opcional)', placeholder: 'Describe a tu mascota...' },
            ].map((f) => (
              <View key={f.name}>
                <Text className="text-sm font-medium text-gray-700 mb-1">{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                      placeholder={f.placeholder}
                      onChangeText={onChange}
                      value={value}
                      multiline={f.name === 'description'}
                      numberOfLines={f.name === 'description' ? 3 : 1}
                    />
                  )}
                />
                {errors[f.name] && (
                  <Text className="text-red-500 text-xs mt-1">{errors[f.name]?.message}</Text>
                )}
              </View>
            ))}

            {/* Looking for partner toggle */}
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
