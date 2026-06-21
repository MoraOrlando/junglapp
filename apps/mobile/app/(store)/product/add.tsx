import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, uploadImages } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';

const { db } = initFirebase();
const AMBER = '#D97706';
const CATEGORIES = ['Alimentos', 'Juguetes', 'Accesorios', 'Higiene', 'Salud', 'Ropa', 'Transporte', 'Camas'];

export default function AddProductScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) setPhotos([...photos, ...result.assets.map((a) => a.uri)]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit() {
    if (!name.trim()) { Alert.alert('Error', 'El nombre es requerido'); return; }
    if (!price.trim() || isNaN(Number(price))) { Alert.alert('Error', 'Ingresa un precio válido'); return; }
    if (!stock.trim() || isNaN(Number(stock))) { Alert.alert('Error', 'Ingresa el stock disponible'); return; }
    if (!user) return;
    setLoading(true);
    try {
      const storeSnap = await getDocs(query(collection(db, COLLECTIONS.STORES), where('userId', '==', user.uid)));
      if (storeSnap.empty) { Alert.alert('Error', 'Tienda no encontrada'); return; }
      const storeId = storeSnap.docs[0].id;
      const photoUrls = photos.length > 0 ? await uploadImages(photos) : [];
      await addDoc(collection(db, COLLECTIONS.PRODUCTS), {
        storeId,
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        stock: Number(stock),
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 8 }}>
            <Text style={{ color: AMBER, fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 22, fontWeight: '800', color: AMBER, marginBottom: 20 }}>📦 Nuevo Producto</Text>

          {/* Fotos */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 10 }}>
              Fotos del producto {photos.length > 0 ? `(${photos.length})` : ''}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {photos.map((uri, i) => (
                  <View key={i} style={{ position: 'relative' }}>
                    <Image
                      source={{ uri }}
                      style={{ width: 80, height: 80, borderRadius: 12 }}
                      contentFit="cover"
                    />
                    <TouchableOpacity
                      onPress={() => removePhoto(i)}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        backgroundColor: '#EF4444', borderRadius: 10, width: 20, height: 20,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={pickPhoto}
                  style={{
                    width: 80, height: 80, borderWidth: 2, borderStyle: 'dashed',
                    borderColor: AMBER, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#FEF3C7',
                  }}
                >
                  <Text style={{ fontSize: 24 }}>📷</Text>
                  <Text style={{ color: AMBER, fontSize: 10, marginTop: 2, fontWeight: '600' }}>Agregar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>

          {/* Campos */}
          <View style={{ gap: 14 }}>
            {[
              { label: 'Nombre del producto *', placeholder: 'Croquetas Premium 10kg', value: name, set: setName, keyboard: 'default' },
              { label: 'Descripción', placeholder: 'Alimento balanceado para perros adultos...', value: description, set: setDescription, multiline: true },
              { label: 'Precio (CLP) *', placeholder: '25000', value: price, set: setPrice, keyboard: 'number-pad' },
              { label: 'Stock disponible *', placeholder: '50', value: stock, set: setStock, keyboard: 'number-pad' },
            ].map((f) => (
              <View key={f.label}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 }}>{f.label}</Text>
                <TextInput
                  style={{
                    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
                    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', fontSize: 15,
                    ...(f.multiline ? { minHeight: 80, textAlignVertical: 'top' } : {}),
                  }}
                  placeholder={f.placeholder}
                  keyboardType={f.keyboard as any}
                  multiline={f.multiline}
                  numberOfLines={f.multiline ? 3 : 1}
                  value={f.value}
                  onChangeText={f.set}
                />
              </View>
            ))}

            {/* Categoría */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 8 }}>Categoría</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={{
                      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1,
                      backgroundColor: category === cat ? AMBER : '#fff',
                      borderColor: category === cat ? AMBER : '#E5E7EB',
                    }}
                  >
                    <Text style={{ fontSize: 13, color: category === cat ? '#fff' : '#6B7280', fontWeight: category === cat ? '600' : '400' }}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: AMBER, borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', marginTop: 24, marginBottom: 40,
              opacity: loading ? 0.7 : 1,
            }}
            onPress={onSubmit}
            disabled={loading}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {loading ? 'Publicando...' : 'Publicar Producto'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
