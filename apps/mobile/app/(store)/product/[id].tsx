import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Product } from '@junglapp/types';

const { db } = initFirebase();

const CATEGORIES = ['Alimentos', 'Juguetes', 'Accesorios', 'Higiene', 'Salud'];

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [stock, setStock] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.PRODUCTS, id)).then((snap) => {
      if (snap.exists()) {
        const p = { id: snap.id, ...snap.data() } as Product;
        setProduct(p);
        setName(p.name);
        setDescription(p.description);
        // If there's an active offer, show the regular (higher) price in the
        // "Precio regular" field and the actual charged amount in "Precio oferta".
        const onSale = p.originalPrice != null && p.originalPrice > p.price;
        setPrice(String(onSale ? p.originalPrice : p.price));
        setOfferPrice(onSale ? String(p.price) : '');
        setStock(String(p.stock));
        setCategory(p.category);
      }
    });
  }, [id]);

  async function save() {
    if (!id) return;
    if (!name || !price || !stock) { Alert.alert('Requerido', 'Completa los campos'); return; }
    if (offerPrice.trim() && (isNaN(Number(offerPrice)) || Number(offerPrice) >= Number(price))) {
      Alert.alert('Error', 'El precio oferta debe ser menor al precio regular');
      return;
    }
    setSaving(true);
    try {
      const hasOffer = !!offerPrice.trim();
      await updateDoc(doc(db, COLLECTIONS.PRODUCTS, id), {
        name, description, stock: Number(stock), category,
        price: hasOffer ? Number(offerPrice) : Number(price),
        originalPrice: hasOffer ? Number(price) : deleteField(),
      });
      Alert.alert('✅', 'Producto actualizado', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!product) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="px-6">
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-6">
            <Text className="text-amber-600 text-base">← Volver</Text>
          </TouchableOpacity>

          <Text className="text-2xl font-bold text-amber-700 mb-6">✏️ Editar Producto</Text>

          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Nombre</Text>
              <TextInput className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base" value={name} onChangeText={setName} />
            </View>
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Descripción</Text>
              <TextInput className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base" value={description} onChangeText={setDescription} multiline numberOfLines={3} />
            </View>
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Precio regular (CLP)</Text>
              <TextInput className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base" value={price} onChangeText={setPrice} keyboardType="number-pad" />
            </View>
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Precio oferta (opcional, si el producto está en descuento)</Text>
              <TextInput className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base" value={offerPrice} onChangeText={setOfferPrice} keyboardType="number-pad" placeholder="Vacío = sin oferta" />
            </View>
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Stock</Text>
              <TextInput className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base" value={stock} onChangeText={setStock} keyboardType="number-pad" />
            </View>
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
            className={`bg-amber-500 rounded-2xl py-4 items-center mt-6 mb-10 ${saving ? 'opacity-70' : ''}`}
            onPress={save}
            disabled={saving}
          >
            <Text className="text-white font-semibold text-base">{saving ? 'Guardando...' : 'Guardar Cambios'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
