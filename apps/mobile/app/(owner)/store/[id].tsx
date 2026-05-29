import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, addDoc, collection } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Product } from '@junglapp/types';

const { db } = initFirebase();

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.PRODUCTS, id)).then((snap) => {
      if (snap.exists()) setProduct({ id: snap.id, ...snap.data() } as Product);
    });
  }, [id]);

  async function placeOrder() {
    if (!product || !user) return;
    if (quantity > product.stock) {
      Alert.alert('Sin stock', `Solo hay ${product.stock} unidades disponibles`);
      return;
    }
    setOrdering(true);
    try {
      await addDoc(collection(db, COLLECTIONS.ORDERS), {
        buyerId: user.uid,
        storeId: product.storeId,
        products: [{
          productId: product.id,
          productName: product.name,
          quantity,
          price: product.price,
          photoUrl: product.photos[0] || null,
        }],
        total: product.price * quantity,
        status: 'pending',
        shippingAddress: user.address,
        createdAt: new Date().toISOString(),
      });
      Alert.alert('¡Pedido realizado! 🎉', `Tu pedido de ${product.name} fue enviado a la tienda.`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setOrdering(false);
    }
  }

  if (!product) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando producto...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1">
        <View className="bg-amber-100 h-56 items-center justify-center">
          <Text className="text-9xl">🐾</Text>
        </View>
        <TouchableOpacity className="absolute top-10 left-4 bg-white/80 rounded-full p-2" onPress={() => router.back()}>
          <Text className="text-amber-700 text-base px-1">←</Text>
        </TouchableOpacity>

        <View className="px-6 -mt-4">
          <View className="bg-white rounded-2xl p-5 shadow-md mb-4">
            <Text className="text-2xl font-bold text-gray-800">{product.name}</Text>
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-3xl font-bold text-primary-600">${product.price.toLocaleString()}</Text>
              <View className={`rounded-full px-3 py-1 ${product.stock > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <Text className={product.stock > 0 ? 'text-green-600 text-sm' : 'text-red-500 text-sm'}>
                  {product.stock > 0 ? `${product.stock} en stock` : 'Sin stock'}
                </Text>
              </View>
            </View>
            <View className="bg-amber-50 rounded-xl px-3 py-1 self-start mt-2">
              <Text className="text-amber-600 text-xs">{product.category}</Text>
            </View>
          </View>

          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
            <Text className="text-gray-400 text-xs mb-1">Descripción</Text>
            <Text className="text-gray-700 leading-relaxed">{product.description}</Text>
          </View>

          {/* Quantity selector */}
          {product.stock > 0 && (
            <View className="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-gray-100">
              <Text className="text-gray-700 font-medium mb-3">Cantidad</Text>
              <View className="flex-row items-center gap-4">
                <TouchableOpacity
                  className="bg-gray-100 rounded-full w-10 h-10 items-center justify-center"
                  onPress={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Text className="text-gray-600 text-xl font-bold">−</Text>
                </TouchableOpacity>
                <Text className="text-2xl font-bold text-gray-800 w-8 text-center">{quantity}</Text>
                <TouchableOpacity
                  className="bg-gray-100 rounded-full w-10 h-10 items-center justify-center"
                  onPress={() => setQuantity(Math.min(product.stock, quantity + 1))}
                >
                  <Text className="text-gray-600 text-xl font-bold">+</Text>
                </TouchableOpacity>
                <Text className="text-gray-400 text-sm ml-2">
                  Total: ${(product.price * quantity).toLocaleString()}
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            className={`bg-primary-500 rounded-2xl py-4 items-center mb-10 ${(product.stock === 0 || ordering) ? 'opacity-50' : ''}`}
            onPress={placeOrder}
            disabled={product.stock === 0 || ordering}
          >
            <Text className="text-white font-semibold text-base">
              {ordering ? 'Procesando...' : product.stock === 0 ? 'Sin stock' : '🛒 Comprar ahora'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
