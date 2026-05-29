import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Product, Store } from '@junglapp/types';

const { db } = initFirebase();

export default function StoreProductsScreen() {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    if (!user) return;
    const storeSnap = await getDocs(
      query(collection(db, COLLECTIONS.STORES), where('userId', '==', user.uid))
    );
    if (!storeSnap.empty) {
      const s = { id: storeSnap.docs[0].id, ...storeSnap.docs[0].data() } as Store;
      setStore(s);
      const prodSnap = await getDocs(
        query(collection(db, COLLECTIONS.PRODUCTS), where('storeId', '==', s.id))
      );
      setProducts(prodSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, [user]));

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function toggleActive(product: Product) {
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), { isActive: !product.isActive });
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, isActive: !p.isActive } : p));
  }

  function confirmDelete(product: Product) {
    Alert.alert('Eliminar producto', `¿Eliminar "${product.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, product.id));
          setProducts((prev) => prev.filter((p) => p.id !== product.id));
        },
      },
    ]);
  }

  if (store?.status === 'pending') {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-5xl mb-4">⏳</Text>
        <Text className="text-xl font-bold text-gray-700 text-center">Tienda en revisión</Text>
        <Text className="text-gray-500 text-sm mt-2 text-center">
          Tu tienda está siendo validada por el equipo de JunglApp. Te avisaremos cuando esté aprobada.
        </Text>
        <TouchableOpacity className="mt-6 bg-gray-100 rounded-xl px-4 py-2" onPress={logOut}>
          <Text className="text-gray-600">Cerrar sesión</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="bg-amber-500 px-6 pb-6 pt-4 rounded-b-3xl">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-white/70 text-sm">Mi Tienda</Text>
            <Text className="text-white text-2xl font-bold">{store?.name || 'Tienda'} 🏪</Text>
          </View>
          <TouchableOpacity className="bg-white/20 rounded-full p-2" onPress={logOut}>
            <Text className="text-white text-sm px-2">Salir</Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row gap-3 mt-6">
          <View className="flex-1 bg-white/20 rounded-2xl p-3 items-center">
            <Text className="text-white text-2xl font-bold">{products.length}</Text>
            <Text className="text-white/80 text-xs">Productos</Text>
          </View>
          <View className="flex-1 bg-white/20 rounded-2xl p-3 items-center">
            <Text className="text-white text-2xl font-bold">{products.filter((p) => p.isActive).length}</Text>
            <Text className="text-white/80 text-xs">Activos</Text>
          </View>
        </View>
      </View>

      <View className="flex-row justify-between items-center px-6 py-4">
        <Text className="text-lg font-bold text-gray-800">Catálogo</Text>
        <TouchableOpacity
          className="bg-amber-500 rounded-full px-4 py-2 flex-row items-center gap-1"
          onPress={() => router.push('/(store)/product/add' as any)}
        >
          <Text className="text-white font-semibold text-sm">+ Agregar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 px-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D97706" />}
      >
        {products.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-5xl mb-3">📦</Text>
            <Text className="text-gray-600 font-medium">Sin productos aún</Text>
            <Text className="text-gray-400 text-sm mt-1 text-center">Agrega tu primer producto para empezar a vender</Text>
          </View>
        ) : (
          <View className="gap-3 pb-6">
            {products.map((product) => (
              <View key={product.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <View className="flex-row items-center gap-3">
                  <View className="bg-amber-50 rounded-xl w-16 h-16 items-center justify-center">
                    <Text className="text-3xl">🐾</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-gray-800">{product.name}</Text>
                    <Text className="text-gray-400 text-xs">{product.category}</Text>
                    <Text className="text-primary-600 font-bold mt-0.5">${product.price.toLocaleString()}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-gray-400 text-xs">Stock: {product.stock}</Text>
                    <TouchableOpacity
                      className={`rounded-full px-2 py-1 mt-1 ${product.isActive ? 'bg-green-100' : 'bg-gray-100'}`}
                      onPress={() => toggleActive(product)}
                    >
                      <Text className={`text-xs ${product.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                        {product.isActive ? 'Activo' : 'Inactivo'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="flex-row gap-2 mt-3 pt-3 border-t border-gray-50">
                  <TouchableOpacity
                    className="flex-1 bg-blue-50 rounded-xl py-2 items-center"
                    onPress={() => router.push(`/(store)/product/${product.id}` as any)}
                  >
                    <Text className="text-blue-600 text-sm font-medium">Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-1 bg-red-50 rounded-xl py-2 items-center"
                    onPress={() => confirmDelete(product)}
                  >
                    <Text className="text-red-500 text-sm font-medium">Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
