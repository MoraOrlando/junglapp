import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, uploadImages } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';

const { db } = initFirebase();

const CATEGORIES = ['Alimentos', 'Juguetes', 'Accesorios', 'Higiene', 'Salud'];

const schema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  description: z.string().min(5, 'Descripción requerida'),
  price: z.string().min(1, 'Precio requerido'),
  stock: z.string().min(1, 'Stock requerido'),
});
type FormData = z.infer<typeof schema>;

export default function AddProductScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [photos, setPhotos] = useState<string[]>([]);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) setPhotos([...photos, ...result.assets.map((a) => a.uri)]);
  }

  async function onSubmit(data: FormData) {
    if (!user) return;
    setLoading(true);
    try {
      const storeSnap = await getDocs(
        query(collection(db, COLLECTIONS.STORES), where('userId', '==', user.uid))
      );
      if (storeSnap.empty) { Alert.alert('Error', 'Tienda no encontrada'); return; }
      const storeId = storeSnap.docs[0].id;

      const photoUrls = await uploadImages(photos);

      await addDoc(collection(db, COLLECTIONS.PRODUCTS), {
        storeId,
        name: data.name,
        description: data.description,
        price: Number(data.price),
        stock: Number(data.stock),
        category,
        photos: photoUrls,
        isActive: true,
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
            <Text className="text-amber-600 text-base">← Volver</Text>
          </TouchableOpacity>

          <Text className="text-2xl font-bold text-amber-700 mb-6">📦 Nuevo Producto</Text>

          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 mb-2">Fotos</Text>
            <View className="flex-row gap-2 flex-wrap">
              {photos.map((_, i) => (
                <View key={i} className="w-20 h-20 bg-amber-50 rounded-xl items-center justify-center">
                  <Text className="text-3xl">🖼️</Text>
                </View>
              ))}
              <TouchableOpacity
                className="w-20 h-20 border-2 border-dashed border-amber-300 rounded-xl items-center justify-center bg-amber-50"
                onPress={pickPhoto}
              >
                <Text className="text-2xl">📷</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="gap-4">
            {[
              { name: 'name' as const, label: 'Nombre del producto', placeholder: 'Croquetas Premium 10kg' },
              { name: 'description' as const, label: 'Descripción', placeholder: 'Alimento balanceado para perros adultos...', multiline: true },
              { name: 'price' as const, label: 'Precio (CLP)', placeholder: '25000', keyboard: 'number-pad' },
              { name: 'stock' as const, label: 'Stock disponible', placeholder: '50', keyboard: 'number-pad' },
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
                      keyboardType={(f as any).keyboard || 'default'}
                      onChangeText={onChange}
                      value={value}
                      multiline={(f as any).multiline}
                      numberOfLines={(f as any).multiline ? 3 : 1}
                    />
                  )}
                />
                {errors[f.name] && <Text className="text-red-500 text-xs mt-1">{errors[f.name]?.message}</Text>}
              </View>
            ))}

            <View>
              <Text className="text-sm font-medium text-gray-700 mb-2">Categoría</Text>
              <View className="flex-row flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    className={`rounded-full px-4 py-2 border ${category === cat ? 'bg-amber-500 border-amber-500' : 'bg-white border-gray-200'}`}
                    onPress={() => setCategory(cat)}
                  >
                    <Text className={`text-sm ${category === cat ? 'text-white' : 'text-gray-600'}`}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <TouchableOpacity
            className={`bg-amber-500 rounded-2xl py-4 items-center mt-6 mb-10 ${loading ? 'opacity-70' : ''}`}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            <Text className="text-white font-semibold text-base">{loading ? 'Guardando...' : 'Publicar Producto'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
